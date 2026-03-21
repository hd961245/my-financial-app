import { NextResponse } from 'next/server';
import { getCachedQuote, setCachedQuote } from '@/lib/quote-cache';

export const dynamic = 'force-dynamic';

const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

const WATCH_SYMBOLS = ['2330', '2454', '2317', '2881', '2603', '2382', '3008', '2412', '2308', '6505'];

// ── Types ────────────────────────────────────────────────────────────────────

interface FlowSummary {
    symbol: string;
    date: string;
    foreignNet: number;
    trustNet: number;
    dealerNet: number;
    totalNet: number;
}

interface MarginSummary {
    symbol: string;
    date: string;
    marginBalance: number;   // 融資餘額（張）
    marginChange: number;    // 融資增減
    shortBalance: number;    // 融券餘額（張）
    shortChange: number;     // 融券增減
    marginRatio: number;     // 融資使用率 (%)
}

interface FuturesSummary {
    date: string;
    foreign: { long: number; short: number; net: number };
    trust:   { long: number; short: number; net: number };
    dealer:  { long: number; short: number; net: number };
    totalNet: number; // 三大法人期貨合計淨倉位
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function dateRange(daysBack: number) {
    const start = new Date();
    start.setDate(start.getDate() - daysBack);
    return {
        startStr: start.toISOString().split('T')[0],
        endStr: new Date().toISOString().split('T')[0],
    };
}

function latestByDate<T extends { date: string }>(rows: T[]): T[] {
    const byDate: Record<string, T[]> = {};
    for (const r of rows) {
        if (!byDate[r.date]) byDate[r.date] = [];
        byDate[r.date].push(r);
    }
    const latest = Object.keys(byDate).sort().at(-1);
    return latest ? byDate[latest] : [];
}

// ── Institutional (現貨法人) ──────────────────────────────────────────────────

async function fetchInstitutional(): Promise<{ topBuying: FlowSummary[]; topSelling: FlowSummary[]; updatedAt: string }> {
    const { startStr, endStr } = dateRange(5);
    const results: FlowSummary[] = [];

    await Promise.allSettled(
        WATCH_SYMBOLS.map(async (sym) => {
            try {
                const url = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockInstitutionalInvestors&data_id=${sym}&start_date=${startStr}&end_date=${endStr}`;
                const json = await fetch(url, { signal: AbortSignal.timeout(8000) }).then(r => r.json());
                if (json.msg !== 'success' || !json.data?.length) return;

                const latest = latestByDate<any>(json.data);
                if (!latest.length) return;

                let foreignNet = 0, trustNet = 0, dealerNet = 0;
                for (const row of latest) {
                    foreignNet += (row.Foreign_Investor_Buy ?? 0) - (row.Foreign_Investor_Sell ?? 0);
                    trustNet   += (row.Investment_Trust_Buy ?? 0) - (row.Investment_Trust_Sell ?? 0);
                    dealerNet  += (row.Dealer_Buy ?? 0) - (row.Dealer_Sell ?? 0);
                }
                results.push({
                    symbol: `${sym}.TW`,
                    date: latest[0].date,
                    foreignNet, trustNet, dealerNet,
                    totalNet: foreignNet + trustNet + dealerNet,
                });
            } catch { /* non-fatal */ }
        })
    );

    const sorted = [...results].sort((a, b) => b.totalNet - a.totalNet);
    return {
        topBuying:  sorted.filter(r => r.totalNet > 0).slice(0, 5),
        topSelling: sorted.filter(r => r.totalNet < 0).slice(-5).reverse(),
        updatedAt:  results[0]?.date ?? endStr,
    };
}

// ── Margin / Short Sale (融資融券) ────────────────────────────────────────────

async function fetchMargin(): Promise<{ top: MarginSummary[]; updatedAt: string }> {
    const { startStr, endStr } = dateRange(5);
    const results: MarginSummary[] = [];

    await Promise.allSettled(
        WATCH_SYMBOLS.map(async (sym) => {
            try {
                const url = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockMarginPurchaseShortSale&data_id=${sym}&start_date=${startStr}&end_date=${endStr}`;
                const json = await fetch(url, { signal: AbortSignal.timeout(8000) }).then(r => r.json());
                if (json.msg !== 'success' || !json.data?.length) return;

                const latest = latestByDate<any>(json.data);
                if (!latest.length) return;
                const row = latest[0];

                const marginBalance = row.MarginPurchaseToday ?? 0;
                const marginQuota   = row.MarginPurchaseLimit ?? 1;
                results.push({
                    symbol: `${sym}.TW`,
                    date: row.date,
                    marginBalance,
                    marginChange: (row.MarginPurchaseBuy ?? 0) - (row.MarginPurchaseSell ?? 0) - (row.MarginPurchaseCashRepayment ?? 0),
                    shortBalance: row.ShortSaleToday ?? 0,
                    shortChange:  (row.ShortSaleSell ?? 0) - (row.ShortSaleBuy ?? 0) - (row.ShortSaleCashRepayment ?? 0),
                    marginRatio:  marginQuota > 0 ? Math.round((marginBalance / marginQuota) * 100) : 0,
                });
            } catch { /* non-fatal */ }
        })
    );

    // Sort by absolute margin change (most active first)
    const sorted = results.sort((a, b) => Math.abs(b.marginChange) - Math.abs(a.marginChange));
    return { top: sorted.slice(0, 10), updatedAt: results[0]?.date ?? endStr };
}

// ── Futures Institutional (期貨大戶未平倉) ────────────────────────────────────

async function fetchFutures(): Promise<FuturesSummary | null> {
    const { startStr, endStr } = dateRange(5);
    try {
        // TX = 台指期
        const url = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanFuturesInstitutionalInvestors&data_id=TX&start_date=${startStr}&end_date=${endStr}`;
        const json = await fetch(url, { signal: AbortSignal.timeout(8000) }).then(r => r.json());
        if (json.msg !== 'success' || !json.data?.length) return null;

        const latest = latestByDate<any>(json.data);
        if (!latest.length) return null;

        const result: FuturesSummary = {
            date: latest[0].date,
            foreign: { long: 0, short: 0, net: 0 },
            trust:   { long: 0, short: 0, net: 0 },
            dealer:  { long: 0, short: 0, net: 0 },
            totalNet: 0,
        };

        for (const row of latest) {
            const name: string = row.name ?? '';
            const longOI  = row.long_open_interest_balance  ?? 0;
            const shortOI = row.short_open_interest_balance ?? 0;
            const net = longOI - shortOI;

            if (name.includes('外資')) {
                result.foreign = { long: longOI, short: shortOI, net };
            } else if (name.includes('投信')) {
                result.trust   = { long: longOI, short: shortOI, net };
            } else if (name.includes('自營')) {
                result.dealer  = { long: longOI, short: shortOI, net };
            }
        }
        result.totalNet = result.foreign.net + result.trust.net + result.dealer.net;
        return result;
    } catch {
        return null;
    }
}

// ── Route Handler ─────────────────────────────────────────────────────────────

export async function GET() {
    const cacheKey = 'capital-flow:v2';
    const cached = getCachedQuote<object>(cacheKey);
    if (cached) return NextResponse.json(cached);

    try {
        const [institutional, margin, futures] = await Promise.all([
            fetchInstitutional(),
            fetchMargin(),
            fetchFutures(),
        ]);

        const payload = { institutional, margin, futures };
        setCachedQuote(cacheKey, payload, CACHE_TTL);
        return NextResponse.json(payload);
    } catch (error) {
        console.error('capital-flow API error:', error);
        return NextResponse.json({ error: '無法取得資金動向資料' }, { status: 500 });
    }
}
