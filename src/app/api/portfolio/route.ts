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
        const allHoldings = Object.values(holdingsMap);

        const flatHoldings = allHoldings
            .filter((data) => data.shares > 0)
            .map((data, index) => ({
                id: `h_${index}`,
                symbol: data.symbol,
                categoryId: data.categoryId,
                categoryName: data.categoryName,
                shares: data.shares,
                price: data.totalCost / data.shares, // Avg Cost
            }));

        const watchlistHoldings = allHoldings
            .filter((data) => data.shares <= 0)
            .map((data, index) => ({
                id: `w_${index}`,
                symbol: data.symbol,
                categoryId: data.categoryId,
                categoryName: data.categoryName,
                shares: 0,
                price: 0,
            }));

        // Group actual holdings by Category Name
        const groupedHoldings: Record<string, any[]> = {};
        flatHoldings.forEach(h => {
            if (!groupedHoldings[h.categoryName]) groupedHoldings[h.categoryName] = [];
            groupedHoldings[h.categoryName].push(h);
        });

        // Fetch live quotes for active unique symbols (including watchlist)
        const uniqueSymbols = Array.from(new Set([...flatHoldings, ...watchlistHoldings].map(h => h.symbol)));
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
            watchlistHoldings,         // Items with 0 shares
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

        // 1. Setup default account linkage
        let account = await prisma.account.findFirst();
        if (!account) {
            account = await prisma.account.create({
                data: {
                    name: "我的模擬帳戶",
                    currency: "TWD",
                    balance: 0,
                    totalDeposit: 0,
                }
            });
        }

        // Handle single insert (existing behavior)
        if (!Array.isArray(body)) {
            const { symbol, type, shares, price, date, categoryId } = body;
            const tradeType = String(type).toUpperCase();
            const totalValue = Number(shares) * Number(price);

            // 2. Prevent over-purchasing logic
            if (tradeType === 'BUY' && account.balance < totalValue) {
                return NextResponse.json({ error: `餘額不足！需要 ${totalValue.toFixed(2)}，但目前帳戶餘額僅有 ${account.balance.toFixed(2)}` }, { status: 400 });
            }

            // 3. Perform Trade and Account Balance update in a Transaction
            const result = await prisma.$transaction(async (tx) => {
                // Update balance if not a WATCH operation
                if (tradeType !== 'WATCH') {
                    const newBalance = tradeType === 'BUY' ? account!.balance - totalValue : account!.balance + totalValue;
                    await tx.account.update({
                        where: { id: account!.id },
                        data: { balance: newBalance }
                    });
                }

                // Create the trade
                const newTrade = await tx.trade.create({
                    data: {
                        symbol: symbol.toUpperCase(),
                        type: tradeType, // 'BUY' or 'SELL'
                        shares: Number(shares),
                        price: Number(price),
                        date: date ? new Date(date) : undefined,
                        categoryId: categoryId || null,
                        accountId: account!.id
                    }
                });

                // Log the ledger transaction if not purely a WATCH
                if (tradeType !== 'WATCH') {
                    await tx.accountTransaction.create({
                        data: {
                            accountId: account!.id,
                            type: tradeType === 'BUY' ? 'TRADE_BUY' : 'TRADE_SELL',
                            amount: tradeType === 'BUY' ? -totalValue : totalValue,
                            notes: `${tradeType === 'BUY' ? '買入' : '賣出'} ${shares} 股 ${symbol.toUpperCase()} @ ${price}`
                        }
                    });
                }

                return newTrade;
            });

            return NextResponse.json(result);
        }

        // Handle batch insert (e.g. initial setup) - We simply write fields directly and add cash if they were BUYs to prevent negative balances if not handled.
        // For simplicity now, let's just insert them directly without full ledger accounting to not break their existing imports
        const batchData = body.map((row: any) => ({
            symbol: String(row.symbol).toUpperCase(),
            type: String(row.type).toUpperCase(),
            shares: Number(row.shares),
            price: Number(row.price),
            date: row.date ? new Date(row.date) : new Date(),
            categoryId: row.categoryId || null,
            accountId: account!.id
        })).filter(r => r.symbol && !isNaN(r.shares) && !isNaN(r.price));

        if (batchData.length === 0) {
            return NextResponse.json({ error: 'No valid trades to insert' }, { status: 400 });
        }

        const newTrades = await prisma.trade.createMany({
            data: batchData
        });
        return NextResponse.json({ count: newTrades.count, message: 'Batch import successful' });

    } catch (error: any) {
        console.error('Failed to add trade(s):', error);
        return NextResponse.json({ error: error.message || 'Failed to add trade(s)' }, { status: 500 });
    }
}
