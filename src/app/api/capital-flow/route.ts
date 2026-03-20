import { NextResponse } from 'next/server';
import { getCachedQuote, setCachedQuote } from '@/lib/quote-cache';

export const dynamic = 'force-dynamic';

// Cache for 15 minutes – institutional data is published once per trading day
const CACHE_TTL = 15 * 60 * 1000;

// Top watched Taiwan stocks for institutional flow overview
const WATCH_SYMBOLS = ['2330', '2454', '2317', '2881', '2603', '2382', '3008', '2412', '2308', '6505'];

interface InstitutionalRecord {
    date: string;
    stock_id: string;
    Foreign_Investor_Buy: number;
    Foreign_Investor_Sell: number;
    Investment_Trust_Buy: number;
    Investment_Trust_Sell: number;
    Dealer_Buy: number;
    Dealer_Sell: number;
    name?: string;
}

interface FlowSummary {
    symbol: string;
    name: string;
    date: string;
    foreignNet: number;   // 外資買超 (正=買超, 負=賣超)
    trustNet: number;     // 投信買超
    dealerNet: number;    // 自營商買超
    totalNet: number;     // 三大法人合計
}

export async function GET() {
    const cacheKey = 'capital-flow:institutional';
    const cached = getCachedQuote<{ topBuying: FlowSummary[]; topSelling: FlowSummary[]; updatedAt: string }>(cacheKey);
    if (cached) return NextResponse.json(cached);

    try {
        // Fetch last 3 trading days so we always get at least one day of data
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 5);
        const startStr = startDate.toISOString().split('T')[0];
        const endStr = new Date().toISOString().split('T')[0];

        const results: FlowSummary[] = [];

        await Promise.allSettled(
            WATCH_SYMBOLS.map(async (sym) => {
                try {
                    const url = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockInstitutionalInvestors&data_id=${sym}&start_date=${startStr}&end_date=${endStr}`;
                    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
                    const json = await res.json();

                    if (json.msg !== 'success' || !json.data?.length) return;

                    // Group by date, take the most recent date
                    const byDate: Record<string, InstitutionalRecord[]> = {};
                    for (const row of json.data as InstitutionalRecord[]) {
                        if (!byDate[row.date]) byDate[row.date] = [];
                        byDate[row.date].push(row);
                    }
                    const latestDate = Object.keys(byDate).sort().at(-1);
                    if (!latestDate) return;

                    let foreignNet = 0, trustNet = 0, dealerNet = 0;
                    for (const row of byDate[latestDate]) {
                        foreignNet += (row.Foreign_Investor_Buy ?? 0) - (row.Foreign_Investor_Sell ?? 0);
                        trustNet   += (row.Investment_Trust_Buy ?? 0) - (row.Investment_Trust_Sell ?? 0);
                        dealerNet  += (row.Dealer_Buy ?? 0) - (row.Dealer_Sell ?? 0);
                    }

                    results.push({
                        symbol: `${sym}.TW`,
                        name: sym,
                        date: latestDate,
                        foreignNet,
                        trustNet,
                        dealerNet,
                        totalNet: foreignNet + trustNet + dealerNet,
                    });
                } catch {
                    // individual symbol failure is non-fatal
                }
            })
        );

        // Sort: top buying = highest totalNet; top selling = lowest totalNet
        const sorted = [...results].sort((a, b) => b.totalNet - a.totalNet);
        const topBuying  = sorted.filter(r => r.totalNet > 0).slice(0, 5);
        const topSelling = sorted.filter(r => r.totalNet < 0).slice(-5).reverse();

        const updatedAt = results[0]?.date ?? endStr;
        const payload = { topBuying, topSelling, updatedAt };

        setCachedQuote(cacheKey, payload, CACHE_TTL);
        return NextResponse.json(payload);
    } catch (error) {
        console.error('capital-flow API error:', error);
        return NextResponse.json({ error: '無法取得法人資料' }, { status: 500 });
    }
}
