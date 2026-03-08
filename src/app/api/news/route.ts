import { NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';

export const dynamic = 'force-dynamic';

const yahooFinance = new YahooFinance();

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        // Default to ^GSPC (S&P 500) if no symbol provided
        const symbol = searchParams.get('symbol') || '^GSPC';

        const result = await yahooFinance.search(symbol, { newsCount: 5 });

        if (!result || !result.news) {
            return NextResponse.json({ error: 'Failed to fetch news' }, { status: 404 });
        }

        return NextResponse.json(result.news);
    } catch (error) {
        console.error('Failed to fetch news:', error);
        return NextResponse.json({ error: 'Failed to fetch news' }, { status: 500 });
    }
}
