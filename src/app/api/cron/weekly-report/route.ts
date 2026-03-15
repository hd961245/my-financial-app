import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { fetchGoogleSheetData } from '@/lib/google-sheets';
import { analyzeStock } from '@/lib/analysis';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Vercel Cron or standard GET endpoint
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // Allow 5 minutes for cron execution

export async function GET(request: Request) {
    try {
        // 1. Fetch Global Google Sheet ID
        const setting = await prisma.systemSetting.findUnique({ where: { key: 'GOOGLE_SHEET_ID' } });
        const sheetId = setting?.value;

        if (!sheetId) {
            return NextResponse.json({ error: '尚未設定 Google 試算表連結。請先至首頁設定。' }, { status: 400 });
        }

        // 2. Fetch Google Sheet Data
        const rows = await fetchGoogleSheetData(sheetId);
        if (rows.length === 0) {
            return NextResponse.json({ error: '試算表為空或無法讀取。' }, { status: 400 });
        }

        const columns = Object.keys(rows[0]).filter(k => k !== 'id');
        const symbolCol = columns.find(c => c.includes('代號') || c.toLowerCase().includes('symbol')) || columns[0];
        const targetPriceCol = columns.find(c => c.includes('目標') || c.toLowerCase().includes('target'));

        // 3. Analyze each stock deeply
        let analysisReports = [];

        // We limit to first 10 stocks to avoid timeout / rate limits during the cron job
        const stocksToAnalyze = rows.slice(0, 10);

        for (const row of stocksToAnalyze) {
            const symbolValue = String(row[symbolCol]).trim();
            if (!symbolValue) continue;

            try {
                const analysis = await analyzeStock(symbolValue);
                const targetPriceRaw = targetPriceCol ? row[targetPriceCol] : null;
                const targetPriceStr = targetPriceRaw ? String(targetPriceRaw).replace(/[^0-9.]/g, '') : null;
                const targetPrice = targetPriceStr ? parseFloat(targetPriceStr) : null;

                let gapToTargetStr = "未設定目標價";
                if (targetPrice && analysis.price) {
                    const diffPercent = ((targetPrice - analysis.price) / analysis.price) * 100;
                    gapToTargetStr = `距離目標價 ${targetPrice} 差 ${diffPercent > 0 ? '+' : ''}${diffPercent.toFixed(2)}%`;
                }

                // Compile stock insight string
                const stockInsight = `
📍 **${analysis.name} (${analysis.symbol})**
- **最新收盤價**：${analysis.price} (${analysis.changePercent >= 0 ? '+' : ''}${analysis.changePercent?.toFixed(2)}%)
- **目標價距離**：${gapToTargetStr}
- **技術面趨勢**：${analysis.technical.trend} (月線 ${analysis.technical.sma20?.toFixed(2)}, 季線 ${analysis.technical.sma60?.toFixed(2)})
- **量能判定**：${analysis.technical.isVolumeBurst ? '🔥 近日出現爆量' : '量能平穩'}
- **近期新聞焦點**：${analysis.news.length > 0 ? analysis.news[0].title : '無'}
                `.trim();

                analysisReports.push(stockInsight);
            } catch (err) {
                console.warn(`Failed to analyze ${symbolValue}:`, err);
            }
        }

        if (analysisReports.length === 0) {
            return NextResponse.json({ error: '無法解析任何股票代號進行健檢。' }, { status: 400 });
        }

        // 4. Send to AI for comprehensive Summary (Gemini or OpenAI)
        const combinedData = analysisReports.join('\n\n');

        const systemPrompt = `你是一位精準、犀利的『首席投資策略長』。
系統剛剛替使用者掃描了他們的「自選股清單」，這是透過量化程式算出的各種指標（包含目標價距離、均線趨勢、是否爆量等）。

請你撰寫一份【本週持股健檢總結報告】。

【絕對規則】：
1. 嚴禁瞎編數據！所有分析只能基於下方提供的數據。
2. 開頭先給一段 50 字以內的「大盤與自選股整體綜合掃描」。
3. 接著，將這些股票分類為：
   - 🟢 **趨勢強勁 / 有爆發潛力** (多頭排列或爆量)
   - 🟡 **盤整觀察區** (短多短空、盤整)
   - 🔴 **弱勢警戒區** (空頭排列)
   並在分類下條列說明原因。
4. 如果有設定目標價且已經非常接近（差不到 5%），請在最後加上「🎯 達標預警」重點提醒。
5. 使用 Markdown 格式。`;

        let finalReport = "";

        try {
            // Try OpenAI First
            const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'dummy_key' });
            const completion = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: `這是本週自選股的量化掃描結果：\n\n${combinedData}\n\n請根據這些數據生成健檢報告！` }
                ],
                temperature: 0.7,
            });
            finalReport = completion.choices[0].message.content || "";
        } catch (openAiErr) {
            console.error("OpenAI failed, falling back to Gemini:", openAiErr);
            // Fallback to Gemini
            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'dummy_key');
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", systemInstruction: systemPrompt });
            const result = await model.generateContent(`這是本週自選股的量化掃描結果：\n\n${combinedData}\n\n請根據這些數據生成健檢報告！`);
            finalReport = result.response.text();
        }

        // Optional: Broadcast it to Discord via Webhook
        const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL;
        if (discordWebhookUrl && finalReport) {
            try {
                // Ensure message isn't too long for Discord (max 2000 chars per message chunk)
                // We'll just truncate or send the first 2000 chars for simplicity, 
                // but real-world usage might require splitting messages.
                const discordContent = finalReport.length > 2000
                    ? finalReport.substring(0, 1995) + '...'
                    : finalReport;

                await fetch(discordWebhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        content: `📊 **每週自選股 AI 健檢報告**\n\n${discordContent}`
                    })
                });
            } catch (discordErr) {
                console.warn("Failed to send webhook to Discord:", discordErr);
            }
        }

        return NextResponse.json({
            success: true,
            summaryReport: finalReport,
            rawAnalysis: analysisReports
        });

    } catch (error: any) {
        console.error("Weekly Cron Error:", error);
        return NextResponse.json({ error: error.message || '生成週報失敗' }, { status: 500 });
    }
}
