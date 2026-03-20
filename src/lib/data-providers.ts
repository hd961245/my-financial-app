import YahooFinance from 'yahoo-finance2';
import { getCachedQuote, setCachedQuote, TTL } from './quote-cache';

const yahooFinance = new YahooFinance();

export type ChartDataPoint = {
    date: string;
    close: number;
};

// ==========================================
// 1. Yahoo Finance Provider (Fallback/Global)
// ==========================================
export async function fetchYahooHistory(symbol: string, days: number = 180): Promise<ChartDataPoint[]> {
    const cacheKey = `dp:yahoo:${symbol}:${days}`;
    const cached = getCachedQuote<ChartDataPoint[]>(cacheKey);
    if (cached) return cached;

    const period1 = new Date();
    period1.setDate(period1.getDate() - days);

    const historical = await yahooFinance.historical(symbol, {
        period1: period1.toISOString().split('T')[0],
        period2: new Date().toISOString().split('T')[0],
        interval: '1d'
    });

    if (!historical || historical.length === 0) {
        throw new Error("Yahoo Finance 無法取得歷史價格");
    }

    const result = historical
        .filter(h => h.close !== null)
        .map(h => ({
            date: h.date.toISOString().split('T')[0],
            close: Number(h.close?.toFixed(2))
        }));

    setCachedQuote(cacheKey, result, TTL.HISTORICAL);
    return result;
}

// ==========================================
// 2. FinMind Provider (Taiwan Stocks Only)
// ==========================================
// FinMind API URL: https://api.finmindtrade.com/api/v4/data
// dataset: TaiwanStockPrice
export async function fetchFinMindHistory(symbol: string, days: number = 180): Promise<ChartDataPoint[]> {
    const rawSymbol = symbol.replace('.TW', '').replace('.TWO', '');

    if (!/^[0-9A-Z]+$/.test(rawSymbol)) {
        throw new Error("此代號不支援 FinMind 查詢");
    }

    const cacheKey = `dp:finmind:${rawSymbol}:${days}`;
    const cached = getCachedQuote<ChartDataPoint[]>(cacheKey);
    if (cached) return cached;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString().split('T')[0];

    const url = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockPrice&data_id=${rawSymbol}&start_date=${startDateStr}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.msg !== "success" || !data.data || data.data.length === 0) {
            throw new Error(`FinMind 無法取得資料: ${data.msg}`);
        }

        const result = data.data.map((item: any) => ({
            date: item.date,
            close: Number(item.close)
        }));

        setCachedQuote(cacheKey, result, TTL.HISTORICAL);
        return result;
    } catch (error: any) {
        throw new Error(`FinMind 請求失敗: ${error.message}`);
    }
}

// ==========================================
// Unified Fetcher Strategy
// ==========================================
export async function fetchChartData(symbol: string, provider: 'auto' | 'yahoo' | 'finmind' = 'auto', days: number = 180) {
    if (provider === 'yahoo') {
        return await fetchYahooHistory(symbol, days);
    }

    if (provider === 'finmind') {
        return await fetchFinMindHistory(symbol, days);
    }

    // Auto strategy: Try FinMind first if it looks like a Taiwan stock, otherwise fallback to Yahoo
    if (symbol.endsWith('.TW') || symbol.endsWith('.TWO')) {
        try {
            return await fetchFinMindHistory(symbol, days);
        } catch (e) {
            console.warn("FinMind fallback to Yahoo Finance:", e);
            return await fetchYahooHistory(symbol, days);
        }
    } else {
        return await fetchYahooHistory(symbol, days);
    }
}
