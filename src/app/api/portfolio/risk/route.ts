import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import YahooFinance from 'yahoo-finance2';
import { getCachedQuote, setCachedQuote } from '@/lib/quote-cache';

export const dynamic = 'force-dynamic';

const RISK_FREE_RATE = 0.02;   // 2% annualised (US T-bill proxy)
const CACHE_TTL = 60 * 60 * 1000; // 1 hour – risk metrics don't need frequent refresh
const yahooFinance = new YahooFinance();

// ── Math helpers ──────────────────────────────────────────────────────────────

function dailyReturns(prices: number[]): number[] {
    const rets: number[] = [];
    for (let i = 1; i < prices.length; i++) {
        if (prices[i - 1] !== 0) rets.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }
    return rets;
}

function mean(arr: number[]): number {
    return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function stddev(arr: number[]): number {
    if (arr.length < 2) return 0;
    const m = mean(arr);
    const variance = arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1);
    return Math.sqrt(variance);
}

function maxDrawdown(prices: number[]): number {
    let peak = -Infinity;
    let maxDD = 0;
    for (const p of prices) {
        if (p > peak) peak = p;
        const dd = peak > 0 ? (peak - p) / peak : 0;
        if (dd > maxDD) maxDD = dd;
    }
    return maxDD;
}

function beta(portfolioRets: number[], benchmarkRets: number[]): number {
    const n = Math.min(portfolioRets.length, benchmarkRets.length);
    if (n < 2) return 1;
    const pSlice = portfolioRets.slice(-n);
    const bSlice = benchmarkRets.slice(-n);
    const pMean = mean(pSlice);
    const bMean = mean(bSlice);
    let cov = 0, varB = 0;
    for (let i = 0; i < n; i++) {
        cov  += (pSlice[i] - pMean) * (bSlice[i] - bMean);
        varB += (bSlice[i] - bMean) ** 2;
    }
    return varB > 0 ? cov / varB : 1;
}

function sharpe(dailyRets: number[]): number {
    if (dailyRets.length < 5) return 0;
    const annReturn = mean(dailyRets) * 252;
    const annVol    = stddev(dailyRets) * Math.sqrt(252);
    return annVol > 0 ? (annReturn - RISK_FREE_RATE) / annVol : 0;
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET() {
    const cacheKey = 'portfolio:risk';
    const cached = getCachedQuote<object>(cacheKey);
    if (cached) return NextResponse.json(cached);

    try {
        // 1. Load net worth snapshots (need at least 10 days for meaningful stats)
        const snapshots = await prisma.netWorthSnapshot.findMany({
            orderBy: { date: 'asc' },
            select: { date: true, totalValue: true },
        });

        if (snapshots.length < 10) {
            return NextResponse.json({
                insufficient: true,
                message: `資料不足（目前 ${snapshots.length} 天，需至少 10 天）`,
            });
        }

        const portfolioPrices = snapshots.map(s => s.totalValue);
        const startDate = snapshots[0].date.toISOString().split('T')[0];

        // 2. Fetch S&P 500 as benchmark for the same period
        let benchmarkRets: number[] = [];
        try {
            const spData = await yahooFinance.historical('^GSPC', {
                period1: startDate,
                period2: new Date().toISOString().split('T')[0],
                interval: '1d',
            });

            // Align benchmark to snapshot dates
            const snapshotDates = new Set(snapshots.map(s => s.date.toISOString().split('T')[0]));
            const aligned = spData
                .filter(d => snapshotDates.has(d.date.toISOString().split('T')[0]))
                .sort((a, b) => a.date.getTime() - b.date.getTime())
                .map(d => d.close ?? 0)
                .filter(v => v > 0);

            benchmarkRets = dailyReturns(aligned);
        } catch {
            // Benchmark unavailable — skip beta calculation
        }

        // 3. Compute metrics
        const portfolioRets   = dailyReturns(portfolioPrices);
        const annReturn        = (mean(portfolioRets) * 252 * 100);         // %
        const annVolatility    = (stddev(portfolioRets) * Math.sqrt(252) * 100); // %
        const maxDD            = maxDrawdown(portfolioPrices) * 100;        // %
        const sharpeRatio      = sharpe(portfolioRets);
        const betaValue        = benchmarkRets.length >= 10
            ? beta(portfolioRets, benchmarkRets)
            : null;

        // 4. Total return since inception
        const first = portfolioPrices[0];
        const last  = portfolioPrices.at(-1)!;
        const totalReturn = first > 0 ? ((last - first) / first) * 100 : 0;

        const days = snapshots.length;
        const payload = {
            insufficient: false,
            days,
            startDate,
            annReturn:     Number(annReturn.toFixed(2)),
            annVolatility: Number(annVolatility.toFixed(2)),
            maxDrawdown:   Number(maxDD.toFixed(2)),
            sharpe:        Number(sharpeRatio.toFixed(3)),
            beta:          betaValue !== null ? Number(betaValue.toFixed(3)) : null,
            totalReturn:   Number(totalReturn.toFixed(2)),
        };

        setCachedQuote(cacheKey, payload, CACHE_TTL);
        return NextResponse.json(payload);
    } catch (error) {
        console.error('portfolio/risk error:', error);
        return NextResponse.json({ error: '無法計算風險指標' }, { status: 500 });
    }
}
