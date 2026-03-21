import { NextRequest, NextResponse } from 'next/server';
import { finmindUrl } from '@/lib/finmind';

interface IncomeItem {
  date: string;
  revenue: number;
  grossProfit: number;
  operatingIncome: number;
  eps: number;
}

interface DividendItem {
  year: number;
  cashDividend: number;
  stockDividend: number;
  yieldPercent: number;
}

interface BalanceData {
  debtRatio: number;
  roe: number;
  currentRatio: number;
}

const FETCH_TIMEOUT = 8000;

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get('symbol');

  if (!symbol) {
    return NextResponse.json({ error: '缺少 symbol 參數' }, { status: 400 });
  }

  // Only support Taiwan stocks (.TW / .TWO / bare 4-digit)
  const isTW = symbol.endsWith('.TW') || symbol.endsWith('.TWO') || /^\d{4,6}$/.test(symbol);
  if (!isTW) {
    return NextResponse.json({ error: '台股財報僅支援台灣股票代號（如 2330 或 2330.TW）' }, { status: 400 });
  }

  const rawSymbol = symbol.replace('.TW', '').replace('.TWO', '');

  // Calculate date range: last 3 years
  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - 3);
  const startDateStr = startDate.toISOString().split('T')[0];

  const [incomeResult, dividendResult, balanceResult] = await Promise.allSettled([
    fetchIncome(rawSymbol, startDateStr, endDate),
    fetchDividends(rawSymbol, startDateStr, endDate),
    fetchBalance(rawSymbol, startDateStr, endDate),
  ]);

  const income: IncomeItem[] = incomeResult.status === 'fulfilled' ? incomeResult.value : [];
  const dividends: DividendItem[] = dividendResult.status === 'fulfilled' ? dividendResult.value : [];
  const balance: BalanceData = balanceResult.status === 'fulfilled' ? balanceResult.value : { debtRatio: 0, roe: 0, currentRatio: 0 };

  return NextResponse.json({ symbol: rawSymbol, income, dividends, balance });
}

async function fetchIncome(symbol: string, startDate: string, endDate: string): Promise<IncomeItem[]> {
  const url = finmindUrl({ dataset: 'TaiwanStockFinancialStatements', data_id: symbol, start_date: startDate, end_date: endDate });
  const res = await fetchWithTimeout(url);
  const data = await res.json();

  if (data.msg !== 'success' || !Array.isArray(data.data)) return [];

  // Group by date (quarter)
  const byDate: Record<string, Record<string, number>> = {};
  for (const item of data.data) {
    if (!byDate[item.date]) byDate[item.date] = {};
    byDate[item.date][item.type] = Number(item.value);
  }

  return Object.entries(byDate)
    .map(([date, vals]) => ({
      date,
      revenue: vals['Revenue'] ?? vals['營業收入'] ?? 0,
      grossProfit: vals['GrossProfit'] ?? vals['營業毛利（毛損）'] ?? 0,
      operatingIncome: vals['OperatingIncome'] ?? vals['營業利益（損失）'] ?? 0,
      eps: vals['EPS'] ?? vals['基本每股盈餘（元）'] ?? 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-8); // last 8 quarters
}

async function fetchDividends(symbol: string, startDate: string, endDate: string): Promise<DividendItem[]> {
  const url = finmindUrl({ dataset: 'TaiwanStockDividend', data_id: symbol, start_date: startDate, end_date: endDate });
  const res = await fetchWithTimeout(url);
  const data = await res.json();

  if (data.msg !== 'success' || !Array.isArray(data.data)) return [];

  // Group by year
  const byYear: Record<number, { cash: number; stock: number }> = {};
  for (const item of data.data) {
    const year = Number(item.date?.slice(0, 4) || 0);
    if (!year) continue;
    if (!byYear[year]) byYear[year] = { cash: 0, stock: 0 };

    const val = Number(item.CashEarningsDistribution ?? item.cash_earnings_distribution ?? 0);
    const stockVal = Number(item.StockEarningsDistribution ?? item.stock_earnings_distribution ?? 0);
    byYear[year].cash += val;
    byYear[year].stock += stockVal;
  }

  return Object.entries(byYear)
    .map(([year, vals]) => ({
      year: Number(year),
      cashDividend: Math.round(vals.cash * 100) / 100,
      stockDividend: Math.round(vals.stock * 100) / 100,
      yieldPercent: 0, // yield requires price data, set to 0 for now
    }))
    .sort((a, b) => a.year - b.year)
    .slice(-5);
}

async function fetchBalance(symbol: string, startDate: string, endDate: string): Promise<BalanceData> {
  const url = finmindUrl({ dataset: 'TaiwanStockBalanceSheet', data_id: symbol, start_date: startDate, end_date: endDate });
  const res = await fetchWithTimeout(url);
  const data = await res.json();

  if (data.msg !== 'success' || !Array.isArray(data.data) || data.data.length === 0) {
    return { debtRatio: 0, roe: 0, currentRatio: 0 };
  }

  // Get most recent entries
  const sorted = [...data.data].sort((a, b) => b.date.localeCompare(a.date));
  const latestDate = sorted[0]?.date;
  const latest = sorted.filter(d => d.date === latestDate);

  const byType: Record<string, number> = {};
  for (const item of latest) {
    byType[item.type] = Number(item.value);
  }

  const totalAssets = byType['TotalAssets'] ?? byType['資產總計'] ?? 0;
  const totalLiabilities = byType['TotalLiabilities'] ?? byType['負債總計'] ?? 0;
  const currentAssets = byType['CurrentAssets'] ?? byType['流動資產合計'] ?? 0;
  const currentLiabilities = byType['CurrentLiabilities'] ?? byType['流動負債合計'] ?? 0;
  const equity = byType['TotalEquity'] ?? byType['權益總計'] ?? (totalAssets - totalLiabilities);

  const debtRatio = totalAssets > 0 ? Math.round((totalLiabilities / totalAssets) * 10000) / 100 : 0;
  const currentRatio = currentLiabilities > 0 ? Math.round((currentAssets / currentLiabilities) * 100) / 100 : 0;

  // ROE requires net income; use 0 as placeholder if not available
  const netIncome = byType['NetIncome'] ?? byType['本期淨利（淨損）'] ?? 0;
  const roe = equity > 0 && netIncome > 0 ? Math.round((netIncome / equity) * 10000) / 100 : 0;

  return { debtRatio, roe, currentRatio };
}
