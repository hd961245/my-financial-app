import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import YahooFinance from 'yahoo-finance2';
import { verifyCronSecret } from '@/lib/cron-auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

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

        const now = new Date();
        const aiRecUpdates = openRecs.flatMap(rec => {
            const exitPrice = quoteMap.get(rec.symbol);
            if (!exitPrice) return [];
            const returnPct = rec.entryPrice > 0 ? ((exitPrice - rec.entryPrice) / rec.entryPrice) * 100 : 0;
            const adjustedReturn = rec.action === 'SELL' ? -returnPct : returnPct;
            return [prisma.aITradingRec.update({
                where: { id: rec.id },
                data: { exitPrice, returnPct: adjustedReturn, isWin: adjustedReturn > 0, closedAt: now },
            })];
        });
        await prisma.$transaction(aiRecUpdates);
        const updated = aiRecUpdates.length;

        // ── Also check DailyRecommendation hits (BUY/SELL only, after 5 days) ──
        const recCutoff = new Date();
        recCutoff.setDate(recCutoff.getDate() - 5);

        const uncheckedRecs = await prisma.dailyRecommendation.findMany({
            where: {
                date: { lte: recCutoff },
                isHit: null,
                action: { in: ['STRONG_BUY', 'BUY', 'REDUCE', 'SELL'] },
            },
        });

        if (uncheckedRecs.length > 0) {
            const recSymbols = [...new Set(uncheckedRecs.map(r => r.symbol))];
            const recQuoteMap = new Map<string, number>();
            await Promise.allSettled(
                recSymbols.map(async (s) => {
                    if (quoteMap.has(s)) { recQuoteMap.set(s, quoteMap.get(s)!); return; }
                    try {
                        const q = await yahooFinance.quote(s) as any;
                        if (q?.regularMarketPrice) recQuoteMap.set(s, q.regularMarketPrice);
                    } catch { /* skip */ }
                })
            );

            const recUpdates = uncheckedRecs.flatMap(rec => {
                const resultPrice = recQuoteMap.get(rec.symbol);
                if (!resultPrice) return [];
                const isBullish = rec.action === 'STRONG_BUY' || rec.action === 'BUY';
                const isHit = isBullish ? resultPrice > rec.price : resultPrice < rec.price;
                return [prisma.dailyRecommendation.update({
                    where: { id: rec.id },
                    data: { resultPrice, resultDate: now, isHit },
                })];
            });
            await prisma.$transaction(recUpdates);
        }

        return NextResponse.json({ success: true, updated });
    } catch (error: any) {
        console.error('Update Performance Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
