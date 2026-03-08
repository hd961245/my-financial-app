import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        // Initialize AI clients inside the handler
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'dummy_key_for_build' });
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'dummy_key_for_build');

        const { symbol } = await request.json();

        if (!symbol) {
            return NextResponse.json({ error: '請提供股票代號' }, { status: 400 });
        }

        const systemPrompt = `你是一位精通股市的『投資小老師』。
請針對使用者提供的股票代號或名稱，用最白話、結構化的方式給出分析。
你的回答必須包含以下三個部分：
1. 【概念股分類】：這家公司主要在做什麼？屬於哪些熱門概念股？
2. 【近期研究關鍵點】：列出 3 個近期值得關注的基本面或產業面關鍵字/事件。
3. 【小老師白話看法】：用一段話總結你對這檔股票的看法（不要給出絕對投資建議，但可以分析強弱）。`;

        const userPrompt = `請幫我分析這檔股票：${symbol}`;

        // OpenAI Request
        const openaiPromise = openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            temperature: 0.7,
        }).then(res => res.choices[0].message.content).catch(err => {
            console.error("OpenAI Error:", err);
            return "OpenAI 分析失敗，請確認 API Key 是否設定正確。";
        });

        // Gemini Request
        const geminiPromise = (async () => {
            try {
                const model = genAI.getGenerativeModel({
                    model: "gemini-2.5-flash",
                    systemInstruction: systemPrompt
                });
                const result = await model.generateContent(userPrompt);
                return result.response.text();
            } catch (err) {
                console.error("Gemini Error:", err);
                return "Gemini 分析失敗，請確認 API Key 是否設定正確。";
            }
        })();

        // Execute both in parallel
        const [openaiResult, geminiResult] = await Promise.all([openaiPromise, geminiPromise]);

        return NextResponse.json({
            result: {
                openai: openaiResult,
                gemini: geminiResult
            }
        });

    } catch (error: any) {
        console.error("AI API Error:", error);
        return NextResponse.json({ error: error.message || 'AI 服務暫時無法回應。' }, { status: 500 });
    }
}
