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
        const systemPrompt = `你是一位犀利的『量化投資分析師』。
使用者目前將一檔股票加入了他們的【觀察清單】（持股 0 股），代表他們正在考慮買進。

請根據以下的技術指標（特別是 5日、20日月線、60日季線的乖離與排列），給出明確的【是否建議買入】建議。
要求：
1. 嚴格限制在 3 句話、50 字以內。
2. 開頭一定要有情緒符號（🟢 適合建倉 / 🟡 再觀察一下 / 🔴 暫時避開）。
3. 語氣自信、客觀。
`;

        const dataPrompt = `
股票：${name || analysis.name} (${symbol})
最新收盤價：$${analysis.price}
趨勢判定：${analysis.technical.trend}
5日均線 (SMA5)：${analysis.technical.sma5?.toFixed(2) || 'N/A'}
20日均線 (SMA20)：${analysis.technical.sma20?.toFixed(2) || 'N/A'}
60日均線 (SMA60)：${analysis.technical.sma60?.toFixed(2) || 'N/A'}
RSI (14)：${analysis.technical.rsi?.toFixed(2) || 'N/A'}
量能狀態：${analysis.technical.isVolumeBurst ? '🔥 近期有出量' : '平穩'}
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
