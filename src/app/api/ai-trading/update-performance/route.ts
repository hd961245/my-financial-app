import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import YahooFinance from 'yahoo-finance2';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

function verifyCronSecret(request: Request): boolean {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) return true;
    return authHeader === `Bearer ${cronSecret}`;
}

// POST /api/ai-trading/update-performance
// Closes open recs that have exceeded close_days and records P&L
export async function POST(request: Request) {
    if (!verifyCronSecret(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const configRow = await prisma.systemSetting.findUnique({ where: { key: 'ai_trading_config' } });
        const config = configRow ? { close_days: 5, ...JSON.parse(configRow.value) } : { close_days: 5 };
        const closeDays: number = config.close_days ?? 5;

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - closeDays);
        cutoffDate.setUTCHours(0, 0, 0, 0);

        // Find open recs older than close_days
        const openRecs = await prisma.aITradingRec.findMany({
            where: { date: { lte: cutoffDate }, closedAt: null },
        });

        if (openRecs.length === 0) {
            return NextResponse.json({ message: '沒有需要結算的推薦', updated: 0 });
        }

        // Get unique symbols
        const symbols = [...new Set(openRecs.map(r => r.symbol))];
        const quoteMap = new Map<string, number>();
        await Promise.allSettled(
            symbols.map(async (s) => {
                try {
                    const q = await yahooFinance.quote(s) as any;
                    if (q?.regularMarketPrice) quoteMap.set(s, q.regularMarketPrice);
                } catch { /* skip */ }
            })
        );

        let updated = 0;
        const now = new Date();
        for (const rec of openRecs) {
            const exitPrice = quoteMap.get(rec.symbol);
            if (!exitPrice) continue;
            const returnPct = rec.entryPrice > 0
                ? ((exitPrice - rec.entryPrice) / rec.entryPrice) * 100
                : 0;
            // For SELL recs, profit is inverted
            const adjustedReturn = rec.action === 'SELL' ? -returnPct : returnPct;
            await prisma.aITradingRec.update({
                where: { id: rec.id },
                data: {
                    exitPrice,
                    returnPct: adjustedReturn,
                    isWin: adjustedReturn > 0,
                    closedAt: now,
                },
            });
            updated++;
        }

        return NextResponse.json({ success: true, updated });
    } catch (error: any) {
        console.error('Update Performance Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
