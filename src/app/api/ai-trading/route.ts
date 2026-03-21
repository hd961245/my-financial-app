import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { claudeJSON } from '@/lib/claude';
import YahooFinance from 'yahoo-finance2';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

interface AITradingConfig {
    claude_enabled: boolean;
    openai_enabled: boolean;
    gemini_enabled: boolean;
    stocks: string[];
    min_confidence: number;
    close_days: number;
    auto_paper_trade: boolean;
    auto_paper_min_confidence: number;
}

const DEFAULT_CONFIG: AITradingConfig = {
    claude_enabled: true,
    openai_enabled: true,
    gemini_enabled: true,
    stocks: ['2330.TW', '2454.TW', '2317.TW', 'AAPL', 'NVDA', 'TSLA'],
    min_confidence: 60,
    close_days: 5,
    auto_paper_trade: false,
    auto_paper_min_confidence: 80,
};

export interface DecisionFactors {
    technical: number;      // 技術面 0-100 (MA, RSI, MACD, breakout)
    fundamental: number;    // 基本面 0-100 (earnings, PE, growth)
    sentiment: number;      // 市場情緒 0-100 (news, institutional flow)
    risk: number;           // 風險評估 0-100 (100 = low risk, 0 = high risk)
}

interface StockRec {
    symbol: string;
    name: string;
    action: 'BUY' | 'SELL' | 'HOLD';
    confidence: number;
    targetPrice: number | null;
    stopLoss: number | null;
    reason: string;
    factors: DecisionFactors;
}

interface AIResponse {
    picks: StockRec[];
}

async function getConfig(): Promise<AITradingConfig> {
    const row = await prisma.systemSetting.findUnique({ where: { key: 'ai_trading_config' } });
    if (!row) return DEFAULT_CONFIG;
    try {
        return { ...DEFAULT_CONFIG, ...JSON.parse(row.value) };
    } catch {
        return DEFAULT_CONFIG;
    }
}

async function getStrategyMemo(model: string): Promise<string> {
    const row = await prisma.systemSetting.findUnique({ where: { key: `ai_trading_strategy_${model}` } });
    if (!row) return '';
    try {
        const parsed = JSON.parse(row.value);
        return parsed.memo || '';
    } catch {
        return row.value;
    }
}

async function fetchQuotes(symbols: string[]): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    await Promise.allSettled(
        symbols.map(async (s) => {
            try {
                const q = await yahooFinance.quote(s) as any;
                if (q?.regularMarketPrice) map.set(s, q.regularMarketPrice);
            } catch { /* skip */ }
        })
    );
    return map;
}

// Shared JSON schema description for AI prompts
const PICK_SCHEMA = `{
  "picks": [{
    "symbol": "2330.TW",
    "name": "台積電",
    "action": "BUY",
    "confidence": 75,
    "targetPrice": 980,
    "stopLoss": 900,
    "reason": "AI 應用需求強勁，突破月線壓力，法人連續買超",
    "factors": {
      "technical": 80,
      "fundamental": 75,
      "sentiment": 70,
      "risk": 65
    }
  }]
}`;

const SCHEMA_RULES = `
規則：
- action 只能是 "BUY"、"SELL" 或 "HOLD"
- confidence: 0-100 整數（你對這個判斷的把握程度）
- targetPrice / stopLoss: 若無把握可設 null
- factors 四個維度各 0-100：
  - technical: 技術面訊號強度（均線、RSI、MACD、突破型態）
  - fundamental: 基本面吸引力（獲利成長、估值、競爭優勢）
  - sentiment: 市場情緒（新聞、法人動向、籌碼）
  - risk: 風險評分（100=極低風險，0=極高風險）`;

async function callClaude(stocks: string[], quotes: Map<string, number>, strategyMemo: string): Promise<StockRec[]> {
    const stockList = stocks.map(s => `${s} (現價: ${quotes.get(s) ?? 'N/A'})`).join('\n');
    const memoSection = strategyMemo
        ? `\n\n【你的優化策略備忘錄】\n${strategyMemo}\n請依照上述策略調整你的判斷權重。`
        : '';
    const system = `你是一位頂尖的量化交易分析師，專精技術分析、基本面研究與市場情緒判讀。${memoSection}
你必須只回傳合法的 JSON，格式如下：
${PICK_SCHEMA}
${SCHEMA_RULES}`;
    const user = `今日日期：${new Date().toLocaleDateString('zh-TW')}
請對以下股票進行全面分析並給出量化交易建議：
${stockList}`;
    const result = await claudeJSON<AIResponse>(system, user, 3000);
    return result.picks || [];
}

async function callOpenAI(stocks: string[], quotes: Map<string, number>, strategyMemo: string): Promise<StockRec[]> {
    const { OpenAI } = await import('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const stockList = stocks.map(s => `${s} (現價: ${quotes.get(s) ?? 'N/A'})`).join('\n');
    const memoSection = strategyMemo
        ? `\n\n【你的優化策略備忘錄】\n${strategyMemo}\n請依照上述策略調整你的判斷權重。`
        : '';
    const system = `你是一位頂尖的量化交易分析師，專精技術分析、基本面研究與市場情緒判讀。${memoSection}
你必須只回傳合法的 JSON，格式如下：
${PICK_SCHEMA}
${SCHEMA_RULES}`;
    const resp = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 3000,
        response_format: { type: 'json_object' },
        messages: [
            { role: 'system', content: system },
            { role: 'user', content: `今日日期：${new Date().toLocaleDateString('zh-TW')}\n請對以下股票進行全面分析並給出量化交易建議：\n${stockList}` },
        ],
    });
    const text = resp.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(text) as AIResponse;
    return parsed.picks || [];
}

async function callGemini(stocks: string[], quotes: Map<string, number>, strategyMemo: string): Promise<StockRec[]> {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const stockList = stocks.map(s => `${s} (現價: ${quotes.get(s) ?? 'N/A'})`).join('\n');
    const memoSection = strategyMemo
        ? `\n\n【你的優化策略備忘錄】\n${strategyMemo}\n請依照上述策略調整你的判斷權重。`
        : '';
    const prompt = `你是一位頂尖的量化交易分析師，專精技術分析、基本面研究與市場情緒判讀。${memoSection}

今日日期：${new Date().toLocaleDateString('zh-TW')}
請對以下股票進行全面分析並給出量化交易建議：
${stockList}

請只回傳合法的 JSON，格式如下：
${PICK_SCHEMA}
${SCHEMA_RULES}`;
    const result = await model.generateContent(prompt);
    const text = result.response.text().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    const parsed = JSON.parse(text) as AIResponse;
    return parsed.picks || [];
}

function safeFactors(f: any): string | null {
    if (!f || typeof f !== 'object') return null;
    const obj = {
        technical: Math.min(100, Math.max(0, Number(f.technical) || 50)),
        fundamental: Math.min(100, Math.max(0, Number(f.fundamental) || 50)),
        sentiment: Math.min(100, Math.max(0, Number(f.sentiment) || 50)),
        risk: Math.min(100, Math.max(0, Number(f.risk) || 50)),
    };
    return JSON.stringify(obj);
}

// POST /api/ai-trading — trigger generation for today
export async function POST() {
    try {
        const config = await getConfig();
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);

        // Check if already generated today
        const existing = await prisma.aITradingRec.count({ where: { date: today } });
        if (existing > 0) {
            return NextResponse.json({ message: `今日已生成 ${existing} 筆推薦，請先刪除再重新生成。`, existing });
        }

        const [quotes, claudeMemo, openaiMemo, geminiMemo] = await Promise.all([
            fetchQuotes(config.stocks),
            getStrategyMemo('claude'),
            getStrategyMemo('openai'),
            getStrategyMemo('gemini'),
        ]);

        const results = await Promise.allSettled([
            config.claude_enabled ? callClaude(config.stocks, quotes, claudeMemo) : Promise.resolve([]),
            config.openai_enabled && process.env.OPENAI_API_KEY ? callOpenAI(config.stocks, quotes, openaiMemo) : Promise.resolve([]),
            config.gemini_enabled && process.env.GEMINI_API_KEY ? callGemini(config.stocks, quotes, geminiMemo) : Promise.resolve([]),
        ]);

        const [claudeResult, openaiResult, geminiResult] = results;

        const toSave: { aiModel: string; picks: StockRec[] }[] = [
            { aiModel: 'claude', picks: claudeResult.status === 'fulfilled' ? claudeResult.value : [] },
            { aiModel: 'openai', picks: openaiResult.status === 'fulfilled' ? openaiResult.value : [] },
            { aiModel: 'gemini', picks: geminiResult.status === 'fulfilled' ? geminiResult.value : [] },
        ];

        const savedRecs: any[] = [];
        for (const { aiModel, picks } of toSave) {
            for (const pick of picks) {
                if (pick.confidence < config.min_confidence) continue;
                const entryPrice = quotes.get(pick.symbol) ?? 0;
                try {
                    const rec = await prisma.aITradingRec.create({
                        data: {
                            date: today,
                            aiModel,
                            symbol: pick.symbol,
                            name: pick.name || pick.symbol,
                            action: pick.action,
                            confidence: pick.confidence,
                            targetPrice: pick.targetPrice ?? null,
                            stopLoss: pick.stopLoss ?? null,
                            entryPrice,
                            reason: pick.reason,
                            factors: safeFactors(pick.factors),
                        },
                    });
                    savedRecs.push(rec);
                } catch { /* skip duplicate */ }
            }
        }

        return NextResponse.json({ success: true, count: savedRecs.length, recs: savedRecs });
    } catch (error: any) {
        console.error('AI Trading Generate Error:', error);
        return NextResponse.json({ error: error.message || '生成失敗' }, { status: 500 });
    }
}

// GET /api/ai-trading — fetch today's recs + leaderboard + strategy memos
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const dateStr = searchParams.get('date');
        const historyMode = searchParams.get('history') === '1';

        const targetDate = dateStr ? new Date(dateStr) : new Date();
        targetDate.setUTCHours(0, 0, 0, 0);

        if (historyMode) {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            thirtyDaysAgo.setUTCHours(0, 0, 0, 0);
            const history = await prisma.aITradingRec.findMany({
                where: { date: { gte: thirtyDaysAgo }, closedAt: { not: null } },
                orderBy: { date: 'desc' },
            });
            return NextResponse.json({ history });
        }

        // Today's recs
        const recs = await prisma.aITradingRec.findMany({
            where: { date: targetDate },
            orderBy: [{ aiModel: 'asc' }, { confidence: 'desc' }],
        });

        // Leaderboard over last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        thirtyDaysAgo.setUTCHours(0, 0, 0, 0);

        const closedRecs = await prisma.aITradingRec.findMany({
            where: { date: { gte: thirtyDaysAgo }, closedAt: { not: null }, returnPct: { not: null } },
        });

        const leaderboard: Record<string, { total: number; wins: number; totalReturn: number }> = {
            claude: { total: 0, wins: 0, totalReturn: 0 },
            openai: { total: 0, wins: 0, totalReturn: 0 },
            gemini: { total: 0, wins: 0, totalReturn: 0 },
        };
        for (const r of closedRecs) {
            if (!leaderboard[r.aiModel]) leaderboard[r.aiModel] = { total: 0, wins: 0, totalReturn: 0 };
            leaderboard[r.aiModel].total++;
            if (r.isWin) leaderboard[r.aiModel].wins++;
            leaderboard[r.aiModel].totalReturn += r.returnPct ?? 0;
        }

        // Strategy memos
        const [claudeRow, openaiRow, geminiRow, config] = await Promise.all([
            prisma.systemSetting.findUnique({ where: { key: 'ai_trading_strategy_claude' } }),
            prisma.systemSetting.findUnique({ where: { key: 'ai_trading_strategy_openai' } }),
            prisma.systemSetting.findUnique({ where: { key: 'ai_trading_strategy_gemini' } }),
            getConfig(),
        ]);

        const parseStrategy = (row: any) => {
            if (!row) return null;
            try { return JSON.parse(row.value); } catch { return { memo: row.value, updatedAt: null }; }
        };

        const strategies = {
            claude: parseStrategy(claudeRow),
            openai: parseStrategy(openaiRow),
            gemini: parseStrategy(geminiRow),
        };

        return NextResponse.json({ recs, leaderboard, config, strategies });
    } catch (error: any) {
        console.error('AI Trading GET Error:', error);
        return NextResponse.json({ error: error.message || '讀取失敗' }, { status: 500 });
    }
}
