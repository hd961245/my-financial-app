import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { analyzeStock } from '@/lib/analysis';
import { claudeJSON } from '@/lib/claude';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

interface StockEntry {
    symbol: string;
    shares: number;
    isHolding: boolean;
}

interface StockRec {
    symbol: string;
    action: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'REDUCE' | 'SELL' | 'WATCH' | 'AVOID';
    reason: string;
}

interface AIResponse {
    summary: string;
    stocks: StockRec[];
    spotlight: { symbol: string; reason: string }[];
    fullReport: string;
}

function verifyCronSecret(request: Request): boolean {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) return true;
    return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(request: Request) {
    if (!verifyCronSecret(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // 1. Collect stocks from portfolio
        const trades = await prisma.trade.findMany({ orderBy: { date: 'asc' } });

        const positionMap = new Map<string, number>();
        for (const trade of trades) {
            const current = positionMap.get(trade.symbol) || 0;
            if (trade.type === 'BUY' || trade.type === 'WATCH') {
                positionMap.set(trade.symbol, current + trade.shares);
            } else if (trade.type === 'SELL') {
                positionMap.set(trade.symbol, current - trade.shares);
            }
        }

        const stockEntries: StockEntry[] = [];
        for (const [symbol, shares] of positionMap.entries()) {
            if (shares >= 0) {
                stockEntries.push({ symbol, shares, isHolding: shares > 0 });
            }
        }

        // Pull Google Sheets watchlist if configured
        try {
            const setting = await prisma.systemSetting.findUnique({ where: { key: 'GOOGLE_SHEET_ID' } });
            if (setting?.value) {
                const { fetchGoogleSheetData } = await import('@/lib/google-sheets');
                const rows = await fetchGoogleSheetData(setting.value);
                if (rows.length > 0) {
                    const columns = Object.keys(rows[0]).filter(k => k !== 'id');
                    const symbolCol = columns.find(c => c.includes('代號') || c.toLowerCase().includes('symbol')) || columns[0];
                    for (const row of rows) {
                        const sym = String(row[symbolCol]).trim();
                        if (sym && !stockEntries.find(e => e.symbol === sym)) {
                            stockEntries.push({ symbol: sym, shares: 0, isHolding: false });
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('Failed to fetch Google Sheets watchlist:', e);
        }

        if (stockEntries.length === 0) {
            return NextResponse.json({ error: '沒有找到任何持股或觀察清單的股票。' }, { status: 400 });
        }

        const toAnalyze = stockEntries.slice(0, 15);

        // 2. Analyze each stock
        const settled = await Promise.allSettled(
            toAnalyze.map(entry => analyzeStock(entry.symbol, { skipAI: true }).then(analysis => ({ entry, analysis })))
        );
        const analysisResults: { entry: StockEntry; analysis: any }[] = [];
        for (const result of settled) {
            if (result.status === 'fulfilled') analysisResults.push(result.value);
            else console.warn('Failed to analyze stock:', result.reason);
        }

        if (analysisResults.length === 0) {
            return NextResponse.json({ error: '無法分析任何股票。' }, { status: 400 });
        }

        // 3. Build data block for AI
        const stockSummaries = analysisResults.map(({ entry, analysis }) => ({
            symbol: analysis.symbol,
            name: analysis.name,
            status: entry.isHolding ? `持有中 (${entry.shares} 股)` : '觀察中',
            price: analysis.price,
            changePercent: analysis.changePercent,
            trend: analysis.technical.trend,
            sma5: analysis.technical.sma5?.toFixed(2),
            sma20: analysis.technical.sma20?.toFixed(2),
            sma60: analysis.technical.sma60?.toFixed(2),
            rsi: analysis.technical.rsi?.toFixed(2),
            volumeBurst: analysis.technical.isVolumeBurst,
            latestNews: analysis.news[0]?.title || '無',
        }));

        const validActions = ['STRONG_BUY', 'BUY', 'HOLD', 'REDUCE', 'SELL', 'WATCH', 'AVOID'];

        const systemPrompt = `你是一位實戰經驗豐富的『每日操盤策略師』。
系統每天早上替使用者掃描持股和觀察清單，提供今日操作建議。

你必須嚴格以 JSON 格式回覆，結構如下：
{
  "summary": "30字以內的今日整體盤勢觀察",
  "stocks": [
    {
      "symbol": "股票代號（原始格式）",
      "action": "動作（必須是以下其中一個：STRONG_BUY, BUY, HOLD, REDUCE, SELL, WATCH, AVOID）",
      "reason": "1-2句技術面具體理由，繁體中文，50字以內"
    }
  ],
  "spotlight": [
    { "symbol": "代號", "reason": "為何今日特別值得關注" }
  ],
  "fullReport": "完整的 Markdown 格式分析報告，包含持有與觀察兩個區塊，以及⚡今日重點關注"
}

規則：
1. 嚴禁瞎編數據，只能依據提供的技術指標
2. 持有中股票的 action 只能是：STRONG_BUY, BUY, HOLD, REDUCE, SELL
3. 觀察中股票的 action 只能是：BUY, STRONG_BUY, WATCH, AVOID
4. spotlight 選 1-3 檔最值得注意的股票
5. 全部使用繁體中文`;

        const userPrompt = `今日掃描資料：\n${JSON.stringify(stockSummaries, null, 2)}\n\n請回傳 JSON 格式的今日操作建議。`;

        let parsed: AIResponse;
        try {
            parsed = await claudeJSON<AIResponse>(systemPrompt, userPrompt, 4096);
        } catch (err) {
            console.error('Claude JSON parsing failed:', err);
            return NextResponse.json({ error: 'AI 分析失敗，請稍後重試' }, { status: 500 });
        }

        if (!parsed || !Array.isArray(parsed.stocks)) {
            return NextResponse.json({ error: 'AI 回傳格式錯誤' }, { status: 500 });
        }

        // Validate actions
        for (const s of parsed.stocks) {
            if (!validActions.includes(s.action)) s.action = 'HOLD';
        }

        // 4. Save to DB (idempotent)
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        await prisma.dailyRecommendation.deleteMany({
            where: { date: { gte: today, lt: new Date(today.getTime() + 86400000) } },
        });
        await prisma.dailyReport.deleteMany({ where: { date: today } });

        await prisma.dailyReport.create({
            data: {
                date: today,
                summary: parsed.summary || '',
                fullReport: parsed.fullReport || '',
                spotlight: JSON.stringify(parsed.spotlight || []),
            },
        });

        const stockRecMap = new Map(parsed.stocks.map(s => [s.symbol, s]));

        for (const { entry, analysis } of analysisResults) {
            const rec = stockRecMap.get(analysis.symbol);
            await prisma.dailyRecommendation.create({
                data: {
                    date: today,
                    symbol: analysis.symbol,
                    name: analysis.name || analysis.symbol,
                    action: rec?.action || (entry.isHolding ? 'HOLD' : 'WATCH'),
                    reason: rec?.reason || '詳見完整報告',
                    price: analysis.price || 0,
                    trend: analysis.technical.trend || 'N/A',
                    rsi: analysis.technical.rsi || null,
                    isHolding: entry.isHolding,
                },
            });
        }

        // 5. Check price alerts
        const activeAlerts = await prisma.priceAlert.findMany({ where: { isActive: true } });
        const triggeredAlerts: string[] = [];

        for (const alert of activeAlerts) {
            const rec = analysisResults.find(r => r.analysis.symbol === alert.symbol);
            if (!rec) continue;
            const currentPrice = rec.analysis.price;
            const triggered =
                (alert.condition === 'ABOVE' && currentPrice >= alert.targetPrice) ||
                (alert.condition === 'BELOW' && currentPrice <= alert.targetPrice);

            if (triggered) {
                await prisma.priceAlert.update({
                    where: { id: alert.id },
                    data: { isActive: false, triggeredAt: new Date() },
                });
                triggeredAlerts.push(
                    `🔔 **${alert.name} (${alert.symbol})** 已${alert.condition === 'ABOVE' ? '突破' : '跌破'} $${alert.targetPrice}（現價 $${currentPrice.toFixed(2)}）`
                );
            }
        }

        // 6. Discord notification
        const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL;
        if (discordWebhookUrl) {
            try {
                let discordMsg = `📋 **每日 AI 操作建議** (${today.toLocaleDateString('zh-TW')})\n\n${parsed.summary}\n\n`;
                if (triggeredAlerts.length > 0) {
                    discordMsg += `**⚠️ 到價提醒：**\n${triggeredAlerts.join('\n')}\n\n`;
                }
                const reportSnippet = parsed.fullReport.length > 1500
                    ? parsed.fullReport.substring(0, 1495) + '...'
                    : parsed.fullReport;
                discordMsg += reportSnippet;

                await fetch(discordWebhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content: discordMsg.substring(0, 2000) }),
                });
            } catch (discordErr) {
                console.warn('Discord notification failed:', discordErr);
            }
        }

        return NextResponse.json({
            success: true,
            date: today.toISOString(),
            stockCount: analysisResults.length,
            triggeredAlerts,
        });
    } catch (error: any) {
        console.error('Daily Recommendation Cron Error:', error);
        return NextResponse.json({ error: error.message || '生成每日推薦失敗' }, { status: 500 });
    }
}
