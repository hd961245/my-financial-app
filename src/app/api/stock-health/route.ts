import { NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';
import { getHistorical } from '@/lib/yahoo-finance';

export const dynamic = 'force-dynamic';

const yahooFinance = new YahooFinance();

// Helper to calculate Simple Moving Average
const calculateSMA = (historicalData: any[], period: number) => {
    if (historicalData.length < period) return null;
    const slice = historicalData.slice(-period);
    const sum = slice.reduce((acc, curr) => acc + curr.close, 0);
    return sum / period;
};

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');

    if (!symbol) {
        return NextResponse.json({ error: 'Symbol parameter is required' }, { status: 400 });
    }

    try {
        // 1. Fetch deep summary modules
        const summary = await yahooFinance.quoteSummary(symbol, {
            modules: ['assetProfile', 'defaultKeyStatistics', 'financialData', 'majorHoldersBreakdown', 'price']
        });

        // 2. Fetch historical data for calculating MAs (Need at least 240 trading days, so fetch ~350 calendar days back)
        const period1 = new Date();
        period1.setDate(period1.getDate() - 400); // 1 year+ back

        const period2 = new Date(); // now

        const historical = await getHistorical(symbol, period1.toISOString().split('T')[0], period2.toISOString().split('T')[0]);
        let ma5 = null, ma10 = null, ma20 = null, ma60 = null, ma240 = null;

        if (historical && historical.length > 0) {
            // Sort by earliest to latest (yahooFinance.historical usually returns earliest to latest)
            ma5 = calculateSMA(historical, 5);
            ma10 = calculateSMA(historical, 10);
            ma20 = calculateSMA(historical, 20);
            ma60 = calculateSMA(historical, 60);
            ma240 = calculateSMA(historical, 240);
        }

        return NextResponse.json({
            // Base properties mapped logically for the frontend
            symbol: symbol,
            shortName: summary.price?.shortName || symbol,
            currentPrice: summary.financialData?.currentPrice,
            changePercent: summary.price?.regularMarketChangePercent,

            // Concept Classification
            sector: summary.assetProfile?.sector,
            industry: summary.assetProfile?.industry,

            // Institutional Chips
            institutionsPercentHeld: summary.majorHoldersBreakdown?.institutionsPercentHeld,
            insidersPercentHeld: summary.majorHoldersBreakdown?.insidersPercentHeld,

            // Fundamentals
            trailingEps: summary.defaultKeyStatistics?.trailingEps,
            forwardPE: summary.defaultKeyStatistics?.forwardPE,
            revenueGrowth: summary.financialData?.revenueGrowth,
            grossMargins: summary.financialData?.grossMargins,
            operatingMargins: summary.financialData?.operatingMargins,

            // Technical MAs
            movingAverages: {
                MA5: ma5,
                MA10: ma10,
                MA20: ma20,
                MA60: ma60,
                MA240: ma240
            }
        });
    } catch (error) {
        console.error('Failed to fetch advanced stock health:', error);
        return NextResponse.json({ error: 'Failed to fetch advanced stock health data' }, { status: 500 });
    }
}
