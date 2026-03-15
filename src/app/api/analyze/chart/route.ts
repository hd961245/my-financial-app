import { NextResponse } from 'next/server';
import { fetchChartData } from '@/lib/data-providers';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const symbol = searchParams.get('symbol');
        const provider = searchParams.get('provider') as 'auto' | 'yahoo' | 'finmind' | null;

        if (!symbol) {
            return NextResponse.json({ error: 'Missing stock symbol' }, { status: 400 });
        }

        // Fetch the historical string data
        const data = await fetchChartData(symbol, provider || 'auto', 180);

        return NextResponse.json({
            success: true,
            symbol,
            provider: provider || 'auto',
            data
        });

    } catch (error: any) {
        console.error("Chart API Error:", error);
        return NextResponse.json({ error: error.message || '無法取得歷史線圖資料' }, { status: 500 });
    }
}
