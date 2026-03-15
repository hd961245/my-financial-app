import { NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';
import { getCachedQuote, setCachedQuote } from '@/lib/quote-cache';

export const dynamic = 'force-dynamic';

const yahooFinance = new YahooFinance();

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const symbol = searchParams.get('symbol');

        if (!symbol) {
            return NextResponse.json({ error: 'Symbol is required' }, { status: 400 });
        }

        // Return cached result if available (60s TTL)
        const cacheKey = `quote:${symbol}`;
        const cached = getCachedQuote<object>(cacheKey);
        if (cached) {
            return NextResponse.json(cached);
        }

        const quote: any = await yahooFinance.quote(symbol);

        if (!quote) {
            return NextResponse.json({ error: 'Failed to fetch quote or symbol not found' }, { status: 404 });
        }

        const result = {
            regularMarketPrice: quote.regularMarketPrice,
            regularMarketChangePercent: quote.regularMarketChangePercent,
            displayName: quote.displayName || quote.longName || quote.shortName,
            symbol: quote.symbol
        };

        setCachedQuote(cacheKey, result);

        return NextResponse.json(result);
    } catch (error) {
        console.error("Quote API Error:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
