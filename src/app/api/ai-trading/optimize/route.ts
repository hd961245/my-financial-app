import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { claudeText } from '@/lib/claude';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface ClosedRec {
    symbol: string;
    name: string;
    action: string;
    confidence: number;
    factors: string | null;
    entryPrice: number;
    exitPrice: number | null;
    returnPct: number | null;
    isWin: boolean | null;
    date: Date;
}

function buildPerformanceSummary(recs: ClosedRec[]): string {
    if (recs.length === 0) return '尚無歷史交易紀錄。';

    const wins = recs.filter(r => r.isWin);
    const losses = recs.filter(r => !r.isWin && r.isWin !== null);
    const avgReturn = recs.reduce((s, r) => s + (r.returnPct ?? 0), 0) / recs.length;

    // Factor averages for wins vs losses
    const factorAvg = (list: ClosedRec[], dim: string) => {
        const vals = list
            .map(r => { try { return JSON.parse(r.factors || '{}')[dim]; } catch { return null; } })
            .filter(v => v != null) as number[];
        return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(0) : 'N/A';
    };

    const lines: string[] = [
        `總交易筆數：${recs.length}，勝：${wins.length}，敗：${losses.length}，勝率：${((wins.length / recs.length) * 100).toFixed(1)}%`,
        `平均報酬：${avgReturn > 0 ? '+' : ''}${avgReturn.toFixed(2)}%`,
        '',
        '【獲利交易的決策因子平均值】',
        `技術面: ${factorAvg(wins, 'technical')}，基本面: ${factorAvg(wins, 'fundamental')}，情緒面: ${factorAvg(wins, 'sentiment')}，風險: ${factorAvg(wins, 'risk')}`,
        '',
        '【虧損交易的決策因子平均值】',
        `技術面: ${factorAvg(losses, 'technical')}，基本面: ${factorAvg(losses, 'fundamental')}，情緒面: ${factorAvg(losses, 'sentiment')}，風險: ${factorAvg(losses, 'risk')}`,
        '',
        '【個別交易紀錄（最近 20 筆）】',
    ];

    const recentRecs = recs.slice(0, 20);
    for (const r of recentRecs) {
        const ret = r.returnPct != null ? `${r.returnPct > 0 ? '+' : ''}${r.returnPct.toFixed(2)}%` : '未結算';
        lines.push(`${new Date(r.date).toLocaleDateString('zh-TW')} ${r.symbol}(${r.name}) ${r.action} 進場${r.entryPrice} → 出場${r.exitPrice ?? '-'} 報酬${ret}`);
    }

    return lines.join('\n');
}

async function optimizeWithClaude(summary: string, currentMemo: string): Promise<string> {
    const system = `你是一位量化交易策略優化師。根據提供的歷史交易績效數據，
你需要分析哪些決策維度（技術面、基本面、情緒面、風險）最能預測成功交易，
並產出一份精煉的「策略備忘錄」，幫助未來的交易決策更準確。

備忘錄要求：
1. 200-400 字，繁體中文
2. 具體指出哪些訊號組合最成功
3. 哪些應該避免
4. 各決策維度的建議權重調整
5. 以第一人稱「我」撰寫，像是給自己的交易筆記`;

    const currentSection = currentMemo
        ? `\n\n【現有策略備忘錄（請在此基礎上優化）】\n${currentMemo}`
        : '';

    const user = `請根據以下績效數據，產出優化後的策略備忘錄：\n\n${summary}${currentSection}`;

    return claudeText(system, user, 1200);
}

async function optimizeWithOpenAI(summary: string, currentMemo: string): Promise<string> {
    const { OpenAI } = await import('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const system = `你是一位量化交易策略優化師。根據歷史交易績效，分析成功與失敗的模式，
產出 200-400 字的策略備忘錄，以第一人稱「我」撰寫，說明未來應加重/減輕哪些決策維度，繁體中文。`;
    const currentSection = currentMemo ? `\n\n現有策略：${currentMemo}` : '';
    const resp = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 1200,
        messages: [
            { role: 'system', content: system },
            { role: 'user', content: `績效數據：\n${summary}${currentSection}` },
        ],
    });
    return resp.choices[0]?.message?.content || '';
}

async function optimizeWithGemini(summary: string, currentMemo: string): Promise<string> {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const currentSection = currentMemo ? `\n\n現有策略：${currentMemo}` : '';
    const prompt = `你是一位量化交易策略優化師。根據以下歷史績效，產出 200-400 字的繁體中文策略備忘錄，
以第一人稱「我」撰寫，說明哪些訊號最有效、未來如何調整決策權重：
${summary}${currentSection}`;
    const result = await model.generateContent(prompt);
    return result.response.text();
}

// POST /api/ai-trading/optimize?model=claude
export async function POST(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const model = searchParams.get('model') || 'claude';

        if (!['claude', 'openai', 'gemini'].includes(model)) {
            return NextResponse.json({ error: '不支援的 model，請使用 claude / openai / gemini' }, { status: 400 });
        }

        // Load last 60 days of closed recs for this model
        const sixtyDaysAgo = new Date();
        sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
        sixtyDaysAgo.setUTCHours(0, 0, 0, 0);

        const closedRecs = await prisma.aITradingRec.findMany({
            where: {
                aiModel: model,
                date: { gte: sixtyDaysAgo },
                closedAt: { not: null },
            },
            orderBy: { date: 'desc' },
        });

        if (closedRecs.length < 3) {
            return NextResponse.json({
                error: `${model} 尚無足夠的歷史交易紀錄（需至少 3 筆已結算推薦）。目前：${closedRecs.length} 筆`,
            }, { status: 422 });
        }

        // Get current strategy memo
        const currentRow = await prisma.systemSetting.findUnique({
            where: { key: `ai_trading_strategy_${model}` },
        });
        const currentMemo = currentRow
            ? (() => { try { return JSON.parse(currentRow.value).memo || ''; } catch { return currentRow.value; } })()
            : '';

        const summary = buildPerformanceSummary(closedRecs);

        // Call the appropriate AI
        let newMemo = '';
        if (model === 'claude') {
            newMemo = await optimizeWithClaude(summary, currentMemo);
        } else if (model === 'openai') {
            if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: 'OPENAI_API_KEY 未設定' }, { status: 500 });
            newMemo = await optimizeWithOpenAI(summary, currentMemo);
        } else {
            if (!process.env.GEMINI_API_KEY) return NextResponse.json({ error: 'GEMINI_API_KEY 未設定' }, { status: 500 });
            newMemo = await optimizeWithGemini(summary, currentMemo);
        }

        const now = new Date().toISOString();
        const value = JSON.stringify({
            memo: newMemo,
            updatedAt: now,
            basedOn: closedRecs.length,
        });

        await prisma.systemSetting.upsert({
            where: { key: `ai_trading_strategy_${model}` },
            create: { key: `ai_trading_strategy_${model}`, value },
            update: { value },
        });

        return NextResponse.json({
            success: true,
            model,
            memo: newMemo,
            updatedAt: now,
            basedOn: closedRecs.length,
            summary,
        });
    } catch (error: any) {
        console.error('Optimize Error:', error);
        return NextResponse.json({ error: error.message || '優化失敗' }, { status: 500 });
    }
}

// GET /api/ai-trading/optimize — return all strategy memos
export async function GET() {
    try {
        const [claudeRow, openaiRow, geminiRow] = await Promise.all([
            prisma.systemSetting.findUnique({ where: { key: 'ai_trading_strategy_claude' } }),
            prisma.systemSetting.findUnique({ where: { key: 'ai_trading_strategy_openai' } }),
            prisma.systemSetting.findUnique({ where: { key: 'ai_trading_strategy_gemini' } }),
        ]);

        const parse = (row: any) => {
            if (!row) return null;
            try { return JSON.parse(row.value); } catch { return { memo: row.value }; }
        };

        return NextResponse.json({
            claude: parse(claudeRow),
            openai: parse(openaiRow),
            gemini: parse(geminiRow),
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
