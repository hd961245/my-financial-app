import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

export const dynamic = 'force-dynamic';

const prisma = new PrismaClient();

export async function POST(request: Request) {
    try {
        // Read the incoming webhook from Discord (or Zapier/Make forwarding Discord messages)
        const body = await request.json();

        // Discord Webhook usually sends data differently, but let's assume a generic format 
        // if the user is using a forwarder tool (e.g., Make.com) to send it to us.
        // We expect { content: string, author: string, channel: string, attachments: any[] }
        const { content, author, channel, attachments } = body;

        // Log it to the console (for debugging)
        console.log(`[Discord Signal] ${author} in ${channel}: ${content}`, attachments);

        // Store the raw signal in a database (we'll implement the actual DB table in a future phase if needed)
        // For now, we just acknowledge receipt and log it.
        // In a full implementation, we would:
        // 1. Save to Prisma `CommunitySignal` table
        // 2. TRIGGER OpenAI to summarize the signal
        // 3. Send a push notification or update the dashboard

        return NextResponse.json({ success: true, message: 'Signal received' });

    } catch (error: any) {
        console.error("Webhook Error:", error);
        return NextResponse.json({ error: error.message || 'Webhook failed' }, { status: 500 });
    }
}
