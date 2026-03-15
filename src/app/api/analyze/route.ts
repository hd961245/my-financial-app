import { NextResponse } from 'next/server';
import { analyzeStock } from '@/lib/analysis';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const symbolParam = searchParams.get('symbol');

    if (!symbolParam) {
        return NextResponse.json({ error: 'Missing symbol parameter' }, { status: 400 });
    }

    try {
        const data = await analyzeStock(symbolParam);
        return NextResponse.json(data);
    } catch (error: any) {
        console.error("Analysis Error:", error);
        return NextResponse.json({ error: error.message || "分析過程中發生錯誤" }, { status: 500 });
    }
}
