import { NextResponse } from 'next/server';
import { analyzeStock } from '@/lib/analysis';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        const { symbol, name } = await request.json();

        if (!symbol) {
            return NextResponse.json({ error: 'Missing symbol' }, { status: 400 });
        }

        // 1. Fetch deep technical data including SMA5, SMA20, SMA60
        const analysis = await analyzeStock(symbol);

        // 2. Prepare AI Prompt
        const t = analysis.technical;

        const systemPrompt = `你是一位犀利的『量化投資分析師』，專注於多指標交叉驗證。
使用者目前將一檔股票加入了【觀察清單】（持股 0 股），代表他們正在考慮買進。

分析原則（嚴格遵守）：
1. 指標互相印證：RSI、MACD、均線、布林通道需互相確認，衝突訊號要降低信心度。
2. 量價一致性：漲勢需有量能支撐，量縮上漲可信度低，量增下跌是空頭確認。
3. 大盤情境：強勢趨勢中的賣訊可信度低，弱勢趨勢中的買訊需更謹慎確認。
4. 如有訊號衝突，必須明確提示，不能給出過度樂觀的結論。

輸出格式要求：
1. 嚴格限制在 3 句話、60 字以內。
2. 開頭一定要有情緒符號（🟢 適合建倉 / 🟡 再觀察一下 / 🔴 暫時避開）。
3. 若有訊號衝突，第 2 句必須說明衝突內容。
4. 語氣自信、客觀，不做空泛預測。
`;

        // MACD 交叉文字
        const macdCrossText = t.macdCrossover === 'golden'
            ? '🔔 剛發生黃金交叉（多頭訊號）'
            : t.macdCrossover === 'death'
            ? '⚠️ 剛發生死亡交叉（空頭訊號）'
            : '無近期交叉';

        // MACD 柱狀圖趨勢
        const histText = t.macdHistogramTrend === 'increasing'
            ? '持續增強（多頭動能加速）'
            : t.macdHistogramTrend === 'decreasing'
            ? '持續減弱（動能衰退）'
            : '平穩';

        // RSI 方向
        const rsiDirText = t.rsiDirection === 'rising' ? '↗ 上升中'
            : t.rsiDirection === 'falling' ? '↘ 下降中' : '→ 持平';

        // 訊號衝突
        const conflictText = t.signalConflicts && t.signalConflicts.length > 0
            ? t.signalConflicts.map((c: string) => `  ⚡ ${c}`).join('\n')
            : '  無明顯衝突';

        const dataPrompt = `
股票：${name || analysis.name} (${symbol})
最新收盤價：$${analysis.price}

【均線系統】
趨勢判定：${t.trend}
SMA5（週線）：${t.sma5?.toFixed(2) || 'N/A'}
SMA20（月線）：${t.sma20?.toFixed(2) || 'N/A'}
SMA60（季線）：${t.sma60?.toFixed(2) || 'N/A'}

【RSI 動能】
RSI(14)：${t.rsi?.toFixed(2) || 'N/A'}（${t.rsi != null ? (t.rsi > 70 ? '超買區' : t.rsi < 30 ? '超賣區' : '中性區') : 'N/A'}，${rsiDirText}）

【MACD 趨勢】
MACD 線：${t.macd?.MACD?.toFixed(4) || 'N/A'}
訊號線：${t.macd?.signal?.toFixed(4) || 'N/A'}
柱狀圖：${t.macd?.histogram?.toFixed(4) || 'N/A'}（趨勢：${histText}）
近期交叉：${macdCrossText}

【布林通道】
位置：${t.bbPosition}
${t.bbNarrow ? '⚠️ 通道明顯收窄（即將出現方向性突破）' : '通道寬度正常'}

【量價關係】
量能狀態：${t.isVolumeBurst ? '🔥 爆量（超過20日均量 2 倍）' : '正常'}
近期量價確認：${t.volumePriceConfirmation}

【訊號衝突偵測】
${conflictText}
`;

        const messages = [
            { role: "system", content: systemPrompt },
            { role: "user", content: dataPrompt }
        ];

        let recommendation = "";

        // Try OpenAI first, fallback to Gemini
        try {
            const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'dummy_key' });
            const completion = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: messages as any,
                temperature: 0.7,
                max_tokens: 150
            });
            recommendation = completion.choices[0].message.content || "";
        } catch (openAiErr) {
            console.warn("OpenAI recommendations failed, falling back to Gemini", openAiErr);
            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'dummy_key');
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", systemInstruction: systemPrompt });
            const result = await model.generateContent(dataPrompt);
            recommendation = result.response.text();
        }

        return NextResponse.json({
            success: true,
            recommendation,
            indicators: analysis.technical
        });

    } catch (error: any) {
        console.error("AI Recommendation Error:", error);
        return NextResponse.json({ error: error.message || '無法產生買入建議' }, { status: 500 });
    }
}
