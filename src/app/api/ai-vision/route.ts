import { NextResponse } from 'next/server';
import { claudeVision } from '@/lib/claude';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
    try {
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

        const reply = await claudeVision(
            systemPrompt,
            prompt || '請幫我分析這張財經截圖的重點：',
            imageBase64,
            'image/jpeg',
            600,
        );

        return NextResponse.json({ result: reply });
    } catch (error: any) {
        console.error('Vision API Error:', error);
        return NextResponse.json({ error: error.message || '無法處理圖片，請確認格式正確且 ANTHROPIC_API_KEY 已設定。' }, { status: 500 });
    }
}
