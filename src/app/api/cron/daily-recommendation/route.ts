import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { analyzeStock } from '@/lib/analysis';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

interface StockEntry {
    symbol: string;
    shares: number;
    isHolding: boolean;
}

export async function GET(request: Request) {
    try {
        // 1. Collect all unique stocks from portfolio (holdings + watchlist)
        const trades = await prisma.trade.findMany({
            orderBy: { date: 'asc' },
        });

        // Calculate net positions per symbol
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
                stockEntries.push({
                    symbol,
                    shares,
                    isHolding: shares > 0,
                });
            }
        }

        // Also pull Google Sheets watchlist if configured
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
            console.warn('Failed to fetch Google Sheets watchlist for daily recommendation:', e);
        }

        if (stockEntries.length === 0) {
            return NextResponse.json({ error: '沒有找到任何持股或觀察清單的股票。請先新增投資組合或自選股。' }, { status: 400 });
        }

        // Limit to 15 stocks max
        const toAnalyze = stockEntries.slice(0, 15);

        // 2. Analyze each stock
        const analysisResults: { entry: StockEntry; analysis: any }[] = [];
        for (const entry of toAnalyze) {
            try {
                const analysis = await analyzeStock(entry.symbol);
                analysisResults.push({ entry, analysis });
            } catch (err) {
                console.warn(`Daily recommendation: failed to analyze ${entry.symbol}:`, err);
            }
        }

        if (analysisResults.length === 0) {
            return NextResponse.json({ error: '無法分析任何股票。' }, { status: 400 });
        }

        // 3. Build data summary for AI
        const stockSummaries = analysisResults.map(({ entry, analysis }) => {
            const holdingStatus = entry.isHolding ? `持有中 (${entry.shares} 股)` : '觀察中 (未持有)';
            return `
📍 **${analysis.name} (${analysis.symbol})** — ${holdingStatus}
- 最新收盤價：$${analysis.price} (${analysis.changePercent >= 0 ? '+' : ''}${analysis.changePercent?.toFixed(2)}%)
- 趨勢：${analysis.technical.trend}
- SMA5: ${analysis.technical.sma5?.toFixed(2) || 'N/A'}, SMA20: ${analysis.technical.sma20?.toFixed(2) || 'N/A'}, SMA60: ${analysis.technical.sma60?.toFixed(2) || 'N/A'}
- RSI(14): ${analysis.technical.rsi?.toFixed(2) || 'N/A'}
- 量能：${analysis.technical.isVolumeBurst ? '🔥 近日爆量' : '平穩'}
- 近期新聞：${analysis.news.length > 0 ? analysis.news[0].title : '無'}
            `.trim();
        }).join('\n\n');

        const systemPrompt = `你是一位實戰經驗豐富的『每日操盤策略師』。
系統每天早上會替使用者掃描他的持股和觀察清單，以下是量化程式分析出的技術面數據。

請你針對每一檔股票給出【今日操作建議】。

【格式要求】：
1. 開頭用一段 30 字以內的「今日整體盤勢觀察」。
2. 將股票分成兩個區塊：
   - 📦 **持有中的股票** — 給出：✅ 繼續持有 / ⬆️ 可加碼 / ⚠️ 考慮減碼 / 🔴 建議賣出
   - 👀 **觀察中的股票** — 給出：🟢 建議買入 / 🟡 繼續觀察 / 🔴 暫時避開
3. 每檔股票只給 1-2 句話，要包含具體技術面理由（如：站上月線、RSI 超賣反彈等）。
4. 最後加一段「⚡ 今日重點關注」，列出最值得注意的 1-3 檔股票及原因。
5. 嚴禁瞎編數據，只能用提供的資料。
6. 使用繁體中文，Markdown 格式。`;

        let aiReport = '';

        try {
            const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'dummy_key' });
            const completion = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: `以下是今日的持股與觀察清單掃描結果：\n\n${stockSummaries}\n\n請給出今日操作建議！` },
                ],
                temperature: 0.7,
            });
            aiReport = completion.choices[0].message.content || '';
        } catch (openAiErr) {
            console.warn('OpenAI daily recommendation failed, falling back to Gemini:', openAiErr);
            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'dummy_key');
            const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash', systemInstruction: systemPrompt });
            const result = await model.generateContent(`以下是今日的持股與觀察清單掃描結果：\n\n${stockSummaries}\n\n請給出今日操作建議！`);
            aiReport = result.response.text();
        }

        // 4. Parse AI response to extract per-stock actions and save to DB
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Delete today's old recommendations (idempotent re-run)
        await prisma.dailyRecommendation.deleteMany({
            where: {
                date: {
                    gte: today,
                    lt: new Date(today.getTime() + 86400000),
                },
            },
        });

        // Save individual stock recommendations
        for (const { entry, analysis } of analysisResults) {
            // Determine action from AI report heuristics
            const symbolMention = aiReport.includes(analysis.symbol) || aiReport.includes(analysis.name);
            let action = entry.isHolding ? 'HOLD' : 'WATCH';

            if (symbolMention) {
                const relevantSection = aiReport.substring(
                    Math.max(0, aiReport.indexOf(analysis.name || analysis.symbol) - 10),
                    aiReport.indexOf(analysis.name || analysis.symbol) + 200
                );
                if (relevantSection.includes('建議賣出') || relevantSection.includes('🔴')) action = entry.isHolding ? 'SELL' : 'AVOID';
                else if (relevantSection.includes('減碼') || relevantSection.includes('⚠️')) action = 'REDUCE';
                else if (relevantSection.includes('加碼') || relevantSection.includes('⬆️')) action = 'STRONG_BUY';
                else if (relevantSection.includes('建議買入') || relevantSection.includes('🟢')) action = 'BUY';
                else if (relevantSection.includes('繼續持有') || relevantSection.includes('✅')) action = 'HOLD';
                else if (relevantSection.includes('繼續觀察') || relevantSection.includes('🟡')) action = 'WATCH';
                else if (relevantSection.includes('避開')) action = 'AVOID';
            }

            // Extract a short reason from the AI report
            let reason = '';
            const nameOrSymbol = analysis.name || analysis.symbol;
            const idx = aiReport.indexOf(nameOrSymbol);
            if (idx !== -1) {
                const afterMention = aiReport.substring(idx, idx + 300);
                const lines = afterMention.split('\n').filter(l => l.trim().length > 0);
                reason = lines.slice(0, 2).join(' ').substring(0, 200);
            }

            await prisma.dailyRecommendation.create({
                data: {
                    date: today,
                    symbol: analysis.symbol,
                    name: analysis.name || analysis.symbol,
                    action,
                    reason: reason || '詳見完整報告',
                    price: analysis.price || 0,
                    trend: analysis.technical.trend || 'N/A',
                    rsi: analysis.technical.rsi || null,
                    isHolding: entry.isHolding,
                },
            });
        }

        // 5. Optional: Send to Discord
        const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL;
        if (discordWebhookUrl && aiReport) {
            try {
                const content = aiReport.length > 1900
                    ? aiReport.substring(0, 1895) + '...'
                    : aiReport;
                await fetch(discordWebhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        content: `📋 **每日 AI 操作建議** (${today.toLocaleDateString('zh-TW')})\n\n${content}`,
                    }),
                });
            } catch (discordErr) {
                console.warn('Failed to send daily recommendation to Discord:', discordErr);
            }
        }

        return NextResponse.json({
            success: true,
            date: today.toISOString(),
            report: aiReport,
            stockCount: analysisResults.length,
        });
    } catch (error: any) {
        console.error('Daily Recommendation Cron Error:', error);
        return NextResponse.json({ error: error.message || '生成每日推薦失敗' }, { status: 500 });
    }
}
