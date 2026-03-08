import { NextResponse } from 'next/server';
import { searchSymbols } from '@/lib/yahoo-finance';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');

    if (!query) {
        return NextResponse.json({ error: 'Query parameter "q" is required' }, { status: 400 });
    }

    const results = await searchSymbols(query as string);

    if (!results) {
        return NextResponse.json({ error: 'Failed to search symbols' }, { status: 500 });
    }

    return NextResponse.json(results);
}
