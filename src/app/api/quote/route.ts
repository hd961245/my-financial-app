import { NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';

export const dynamic = 'force-dynamic';

const yahooFinance = new YahooFinance();

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const symbol = searchParams.get('symbol');

        if (!symbol) {
            return NextResponse.json({ error: 'Symbol is required' }, { status: 400 });
        }

        const quote: any = await yahooFinance.quote(symbol);

        if (!quote) {
            return NextResponse.json({ error: 'Failed to fetch quote or symbol not found' }, { status: 404 });
        }

        return NextResponse.json({
            regularMarketPrice: quote.regularMarketPrice,
            regularMarketChangePercent: quote.regularMarketChangePercent,
            displayName: quote.displayName || quote.longName || quote.shortName,
            symbol: quote.symbol
        });
    } catch (error) {
        console.error("Quote API Error:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
