import { NextResponse } from 'next/server';
import { getHistorical } from '@/lib/yahoo-finance';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    const period1 = searchParams.get('period1');
    const period2 = searchParams.get('period2');

    if (!symbol || !period1) {
        return NextResponse.json({ error: 'Symbol and period1(start date) are required' }, { status: 400 });
    }

    const data = await getHistorical(
        symbol as string,
        period1 as string,
        period2 ? (period2 as string) : undefined
    );

    if (!data) {
        return NextResponse.json({ error: 'Failed to fetch historical data' }, { status: 404 });
    }

    return NextResponse.json(data);
}
