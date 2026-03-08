import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance();

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const trades = await prisma.trade.findMany({
            orderBy: { date: 'asc' },
            include: { category: true } // Include relation
        });

        const holdingsMap: Record<string, { symbol: string, categoryId: string | null, categoryName: string, shares: number, totalCost: number }> = {};
        let totalRealizedPnL = 0;

        trades.forEach((trade: any) => {
            const sym = trade.symbol;
            const catId = trade.categoryId || 'unassigned';
            const catName = trade.category?.name || '未分類 (Unassigned)';
            const key = `${sym}_${catId}`;

            if (!holdingsMap[key]) {
                holdingsMap[key] = { symbol: sym, categoryId: trade.categoryId, categoryName: catName, shares: 0, totalCost: 0 };
            }

            if (trade.type === 'BUY') {
                holdingsMap[key].shares += trade.shares;
                holdingsMap[key].totalCost += trade.shares * trade.price;
            } else if (trade.type === 'SELL') {
                const currentShares = holdingsMap[key].shares;

                if (currentShares > 0) {
                    const avgCost = holdingsMap[key].totalCost / currentShares;
                    const realizedGain = (trade.price - avgCost) * trade.shares;
                    totalRealizedPnL += realizedGain;

                    holdingsMap[key].shares -= trade.shares;
                    holdingsMap[key].totalCost -= avgCost * trade.shares;
                }
            }
        });

        // Format and flatten holdings
        const flatHoldings = Object.values(holdingsMap)
            .filter((data) => data.shares > 0)
            .map((data, index) => ({
                id: index,
                symbol: data.symbol,
                categoryId: data.categoryId,
                categoryName: data.categoryName,
                shares: data.shares,
                price: data.totalCost / data.shares, // Avg Cost
            }));

        // Group holdings by Category Name
        const groupedHoldings: Record<string, any[]> = {};
        flatHoldings.forEach(h => {
            if (!groupedHoldings[h.categoryName]) groupedHoldings[h.categoryName] = [];
            groupedHoldings[h.categoryName].push(h);
        });

        // Fetch live quotes for active unique symbols
        const uniqueSymbols = Array.from(new Set(flatHoldings.map(h => h.symbol)));
        const quotes: Record<string, { regularMarketPrice: number, regularMarketChangePercent: number }> = {};
        for (const sym of uniqueSymbols) {
            try {
                const quote = await yahooFinance.quote(sym);
                if (quote) {
                    quotes[sym] = {
                        regularMarketPrice: quote.regularMarketPrice || 0,
                        regularMarketChangePercent: quote.regularMarketChangePercent || 0,
                    };
                }
            } catch (e) {
                console.error(`Failed to fetch quote in portfolio backend for ${sym}:`, e);
            }
        }

        return NextResponse.json({
            holdings: groupedHoldings, // Now sending grouped object
            flatHoldings,              // Keeping flat array just in case
            trades: trades.reverse(),
            realizedPnL: totalRealizedPnL,
            quotes
        });
    } catch (error) {
        console.error('Failed to fetch portfolio:', error);
        return NextResponse.json({ error: 'Failed to fetch portfolio' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();

        // Handle batch insert
        if (Array.isArray(body)) {
            // Validate and type cast each row
            const batchData = body.map((row: any) => ({
                symbol: String(row.symbol).toUpperCase(),
                type: String(row.type).toUpperCase(),
                shares: Number(row.shares),
                price: Number(row.price),
                date: row.date ? new Date(row.date) : new Date(),
                categoryId: row.categoryId || null
            })).filter(r => r.symbol && !isNaN(r.shares) && !isNaN(r.price));

            if (batchData.length === 0) {
                return NextResponse.json({ error: 'No valid trades to insert' }, { status: 400 });
            }

            // Using createMany for better performance in PostgreSQL
            const newTrades = await prisma.trade.createMany({
                data: batchData
            });
            return NextResponse.json({ count: newTrades.count, message: 'Batch import successful' });
        }

        // Handle single insert (existing behavior)
        const { symbol, type, shares, price, date, categoryId } = body;

        const newTrade = await prisma.trade.create({
            data: {
                symbol: symbol.toUpperCase(),
                type: type.toUpperCase(), // 'BUY' or 'SELL'
                shares: Number(shares),
                price: Number(price),
                date: date ? new Date(date) : undefined,
                categoryId: categoryId || null
            }
        });

        return NextResponse.json(newTrade);
    } catch (error) {
        console.error('Failed to add trade(s):', error);
        return NextResponse.json({ error: 'Failed to add trade(s)' }, { status: 500 });
    }
}
