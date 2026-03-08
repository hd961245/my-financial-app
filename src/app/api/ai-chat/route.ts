import { NextResponse } from 'next/server';
import OpenAI from 'openai';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        // Initialize OpenAI client inside the handler so build doesn't fail if env var is missing
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'dummy_key_for_build' });

        const { symbol } = await request.json();

        if (!symbol) {
            return NextResponse.json({ error: '請提供股票代號' }, { status: 400 });
        }

        // Fetch basic info from Yahoo Finance (optional enhancement for Phase 1)
        // For now, let's use the LLM to give a general analysis.
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini", // Cost-effective and fast
            messages: [
                {
                    role: "system",
                    content: `你是一位精通股市的『投資小老師』。
請針對使用者提供的股票代號或名稱，用最白話、結構化的方式給出分析。
你的回答必須包含以下三個部分：
1. 【概念股分類】：這家公司主要在做什麼？屬於哪些熱門概念股？
2. 【近期研究關鍵點】：列出 3 個近期值得關注的基本面或產業面關鍵字/事件。
3. 【小老師白話看法】：用一段話總結你對這檔股票的看法（不要給出絕對投資建議，但可以分析強弱）。`
                },
                {
                    role: "user",
                    content: `請幫我分析這檔股票：${symbol}`
                }
            ],
            temperature: 0.7,
        });

        const reply = response.choices[0].message.content;

        return NextResponse.json({ result: reply });

    } catch (error: any) {
        console.error("AI API Error:", error);
        return NextResponse.json({ error: error.message || 'AI 服務暫時無法回應，請確認 API Key 是否設定正確。' }, { status: 500 });
    }
}
