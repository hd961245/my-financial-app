import { NextResponse } from 'next/server';
import { claudeVision } from '@/lib/claude';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { content, attachments, replyToWebhook, author } = body;

        console.log(`[Discord Webhook] Received from ${author || 'Unknown'}:`, content);

        if (!attachments || attachments.length === 0) {
            return NextResponse.json({ message: 'No images found in the request.' }, { status: 200 });
        }

        const imageUrl = attachments[0]?.url || attachments[0];

        if (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.startsWith('http')) {
            return NextResponse.json({ message: 'Invalid image URL.' }, { status: 400 });
        }

        console.log(`[Discord Webhook] Downloading image: ${imageUrl}`);
        const imageResponse = await fetch(imageUrl);
        const arrayBuffer = await imageResponse.arrayBuffer();
        const base64Image = Buffer.from(arrayBuffer).toString('base64');
        const rawMime = imageResponse.headers.get('content-type') || 'image/jpeg';
        const mediaType = (['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(rawMime)
            ? rawMime
            : 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

        const systemPrompt = `你是一位專業的『財經社群情報員』。
使用者上傳了一張他們在社群群組收到的財經相關截圖。
請你幫忙：
1. 辨識並提取圖片中有提到的【股票代號或名稱】。
2. 判斷這張圖傳遞的【情報摘要】（例如：這是在炫耀獲利、還是在推薦某檔股票、或是單純的走勢圖？）。
3. 給出你客觀的【一小段評語】。
如果圖片中完全沒有財經資訊，請禮貌地回覆無法辨識。`;

        const userPrompt = content
            ? `群組文字內容補充：「${content}」\n請結合圖片一起分析重點：`
            : '請幫我分析這張截圖的重點：';

        const replyText = await claudeVision(systemPrompt, userPrompt, base64Image, mediaType, 600);
        console.log('[Discord Webhook] AI Analysis Complete.');

        if (replyToWebhook && replyText) {
            await fetch(replyToWebhook, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: `🤖 **情報員分析報告 (來自 ${author || '群組'})**\n\n${replyText}`,
                }),
            });
        }

        return NextResponse.json({ success: true, analysis: replyText });
    } catch (error: any) {
        console.error('Discord Webhook Error:', error);
        return NextResponse.json({ error: error.message || 'Webhook processing failed' }, { status: 500 });
    }
}
