import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCacheStats } from '@/lib/quote-cache';
import YahooFinance from 'yahoo-finance2';

export const dynamic = 'force-dynamic';

async function checkDatabase(): Promise<{ status: 'ok' | 'error'; latencyMs: number; detail?: string }> {
    const start = Date.now();
    try {
        await prisma.$queryRaw`SELECT 1`;
        return { status: 'ok', latencyMs: Date.now() - start };
    } catch (e: any) {
        return { status: 'error', latencyMs: Date.now() - start, detail: e.message };
    }
}

async function checkYahooFinance(): Promise<{ status: 'ok' | 'error'; latencyMs: number; detail?: string }> {
    const start = Date.now();
    try {
        const yf = new YahooFinance();
        await yf.quote('^GSPC');
        return { status: 'ok', latencyMs: Date.now() - start };
    } catch (e: any) {
        return { status: 'error', latencyMs: Date.now() - start, detail: e.message };
    }
}

export async function GET() {
    const [db, yahoo] = await Promise.allSettled([
        checkDatabase(),
        checkYahooFinance(),
    ]);

    const dbResult   = db.status   === 'fulfilled' ? db.value   : { status: 'error' as const, latencyMs: 0, detail: String((db as PromiseRejectedResult).reason) };
    const yfResult   = yahoo.status === 'fulfilled' ? yahoo.value : { status: 'error' as const, latencyMs: 0, detail: String((yahoo as PromiseRejectedResult).reason) };

    const openaiConfigured = !!process.env.OPENAI_API_KEY;
    const geminiConfigured = !!process.env.GEMINI_API_KEY;

    const cacheStats = getCacheStats();

    const allOk = dbResult.status === 'ok' && yfResult.status === 'ok';
    const overallStatus = allOk ? 'ok' : 'degraded';

    return NextResponse.json(
        {
            status: overallStatus,
            timestamp: new Date().toISOString(),
            services: {
                database:     dbResult,
                yahooFinance: yfResult,
                openai:  { status: openaiConfigured  ? 'configured' : 'missing' },
                gemini:  { status: geminiConfigured  ? 'configured' : 'missing' },
            },
            cache: cacheStats,
        },
        { status: overallStatus === 'ok' ? 200 : 503 }
    );
}
