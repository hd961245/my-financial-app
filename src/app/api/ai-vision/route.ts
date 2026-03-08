import { NextResponse } from 'next/server';
import OpenAI from 'openai';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow more time for image processing

export async function POST(request: Request) {
    try {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'dummy_key_for_build' });

        const body = await request.json();
        const { imageBase64, prompt } = body;

        if (!imageBase64) {
            return NextResponse.json({ error: '請提供圖片資料 (Base64)' }, { status: 400 });
        }

        const systemPrompt = `你是一位專業的『財經社群情報員』。
使用者會上傳一張財經相關的截圖（可能是對帳單、券商畫面、或是群組聊天紀錄）。
請你幫忙：
1. 辨識並提取圖片中有提到的【股票代號或名稱】。
2. 判斷這張圖傳遞的【情報摘要】（例如：這是在炫耀獲利、還是在推薦某檔股票、或是單純的走勢圖？）。
3. 給出你客觀的【一小段評語】。
如果圖片中完全沒有財經資訊，請禮貌地回覆無法辨識。`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o", // Must use gpt-4o or gpt-4o-mini for vision
            messages: [
                {
                    role: "system",
                    content: systemPrompt
                },
                {
                    role: "user",
                    content: [
                        { type: "text", text: prompt || "請幫我分析這張財經截圖的重點：" },
                        {
                            type: "image_url",
                            image_url: {
                                url: `data:image/jpeg;base64,${imageBase64}`,
                            },
                        },
                    ],
                }
            ],
            max_tokens: 500,
        });

        const reply = response.choices[0].message.content;

        return NextResponse.json({ result: reply });

    } catch (error: any) {
        console.error("Vision API Error:", error);
        return NextResponse.json({ error: error.message || '無法處理圖片，請確認是否格式正確且 API Key 有效。' }, { status: 500 });
    }
}
