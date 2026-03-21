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

interface StockRec {
    symbol: string;
    name: string;
    action: 'BUY' | 'SELL' | 'HOLD';
    confidence: number;
    targetPrice: number | null;
    stopLoss: number | null;
    reason: string;
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

async function callClaude(stocks: string[], quotes: Map<string, number>): Promise<StockRec[]> {
    const stockList = stocks.map(s => `${s} (現價: ${quotes.get(s) ?? 'N/A'})`).join(', ');
    const system = `你是一位頂尖的量化交易分析師。請根據你對這些股票的最新認知（技術面 + 基本面 + 市場情緒），
對每一支股票給出一個交易建議。你必須只回傳合法的 JSON，格式如下：
{"picks":[{"symbol":"2330.TW","name":"台積電","action":"BUY","confidence":75,"targetPrice":980,"stopLoss":900,"reason":"AI 應用需求強勁，突破月線壓力"}]}
action 只能是 "BUY"、"SELL" 或 "HOLD"。confidence 是 0-100 整數。targetPrice / stopLoss 若無把握可設 null。`;
    const user = `今日日期：${new Date().toLocaleDateString('zh-TW')}
請分析以下股票並給出量化交易建議：${stockList}`;
    const result = await claudeJSON<AIResponse>(system, user, 2048);
    return result.picks || [];
}

async function callOpenAI(stocks: string[], quotes: Map<string, number>): Promise<StockRec[]> {
    const { OpenAI } = await import('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const stockList = stocks.map(s => `${s} (現價: ${quotes.get(s) ?? 'N/A'})`).join(', ');
    const resp = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 2048,
        response_format: { type: 'json_object' },
        messages: [
            {
                role: 'system',
                content: `你是一位頂尖的量化交易分析師。請根據你對這些股票的最新認知（技術面 + 基本面 + 市場情緒），
對每一支股票給出一個交易建議。你必須只回傳合法的 JSON，格式如下：
{"picks":[{"symbol":"2330.TW","name":"台積電","action":"BUY","confidence":75,"targetPrice":980,"stopLoss":900,"reason":"..."}]}
action 只能是 "BUY"、"SELL" 或 "HOLD"。confidence 是 0-100 整數。targetPrice / stopLoss 若無把握可設 null。`,
            },
            {
                role: 'user',
                content: `今日日期：${new Date().toLocaleDateString('zh-TW')}\n請分析以下股票並給出量化交易建議：${stockList}`,
            },
        ],
    });
    const text = resp.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(text) as AIResponse;
    return parsed.picks || [];
}

async function callGemini(stocks: string[], quotes: Map<string, number>): Promise<StockRec[]> {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const stockList = stocks.map(s => `${s} (現價: ${quotes.get(s) ?? 'N/A'})`).join(', ');
    const prompt = `你是一位頂尖的量化交易分析師。
今日日期：${new Date().toLocaleDateString('zh-TW')}
請分析以下股票並給出量化交易建議：${stockList}
請只回傳合法的 JSON，格式如下：
{"picks":[{"symbol":"2330.TW","name":"台積電","action":"BUY","confidence":75,"targetPrice":980,"stopLoss":900,"reason":"..."}]}
action 只能是 "BUY"、"SELL" 或 "HOLD"。confidence 是 0-100 整數。targetPrice / stopLoss 若無把握可設 null。`;
    const result = await model.generateContent(prompt);
    const text = result.response.text().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    const parsed = JSON.parse(text) as AIResponse;
    return parsed.picks || [];
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

        const quotes = await fetchQuotes(config.stocks);

        const results = await Promise.allSettled([
            config.claude_enabled ? callClaude(config.stocks, quotes) : Promise.resolve([]),
            config.openai_enabled && process.env.OPENAI_API_KEY ? callOpenAI(config.stocks, quotes) : Promise.resolve([]),
            config.gemini_enabled && process.env.GEMINI_API_KEY ? callGemini(config.stocks, quotes) : Promise.resolve([]),
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

// GET /api/ai-trading — fetch today's recs + leaderboard
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const dateStr = searchParams.get('date');
        const historyMode = searchParams.get('history') === '1';

        const targetDate = dateStr ? new Date(dateStr) : new Date();
        targetDate.setUTCHours(0, 0, 0, 0);

        if (historyMode) {
            // Return last 30 days of closed recs grouped by date
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

        // Leaderboard: win rate + avg return per AI over last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        thirtyDaysAgo.setUTCHours(0, 0, 0, 0);

        const closedRecs = await prisma.aITradingRec.findMany({
            where: {
                date: { gte: thirtyDaysAgo },
                closedAt: { not: null },
                returnPct: { not: null },
            },
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

        const config = await getConfig();

        return NextResponse.json({ recs, leaderboard, config });
    } catch (error: any) {
        console.error('AI Trading GET Error:', error);
        return NextResponse.json({ error: error.message || '讀取失敗' }, { status: 500 });
    }
}
