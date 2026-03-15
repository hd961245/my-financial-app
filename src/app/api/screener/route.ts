import { NextRequest, NextResponse } from 'next/server';
import { analyzeStock } from '@/lib/analysis';

interface ScreenerFilters {
  rsi_lt?: number;
  rsi_gt?: number;
  trend?: string[];
  above_sma20?: boolean;
  above_sma60?: boolean;
  volume_burst?: boolean;
  change_gt?: number;
  change_lt?: number;
}

interface ScreenerRequest {
  symbols: string[];
  filters: ScreenerFilters;
}

export async function POST(req: NextRequest) {
  try {
    const body: ScreenerRequest = await req.json();
    const { symbols, filters } = body;

    if (!Array.isArray(symbols) || symbols.length === 0) {
      return NextResponse.json({ error: '請提供至少一個股票代號' }, { status: 400 });
    }

    if (symbols.length > 20) {
      return NextResponse.json({ error: '最多支援 20 支股票同時篩選' }, { status: 400 });
    }

    // Run analysis in parallel with concurrency limit
    const BATCH_SIZE = 5;
    const results: any[] = [];

    for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
      const batch = symbols.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.allSettled(
        batch.map(sym => analyzeStock(sym.trim()))
      );

      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        const sym = batch[j];

        if (result.status === 'rejected') {
          results.push({
            symbol: sym,
            error: result.reason?.message || '分析失敗',
            passed: false,
          });
          continue;
        }

        const data = result.value;
        const tech = data.technical;
        const changePercent = (data.changePercent ?? 0) * 100;

        // Apply filters
        let passed = true;

        if (filters.rsi_lt !== undefined && tech.rsi !== null && tech.rsi >= filters.rsi_lt) passed = false;
        if (filters.rsi_gt !== undefined && tech.rsi !== null && tech.rsi <= filters.rsi_gt) passed = false;

        if (filters.trend && filters.trend.length > 0) {
          const trendMatches = filters.trend.some(t => data.technical.trend.includes(t));
          if (!trendMatches) passed = false;
        }

        if (filters.above_sma20 && tech.sma20 && data.price <= tech.sma20) passed = false;
        if (filters.above_sma60 && tech.sma60 && data.price <= tech.sma60) passed = false;

        if (filters.volume_burst && !tech.isVolumeBurst) passed = false;

        if (filters.change_gt !== undefined && changePercent <= filters.change_gt) passed = false;
        if (filters.change_lt !== undefined && changePercent >= filters.change_lt) passed = false;

        results.push({
          symbol: data.symbol,
          name: data.name,
          price: data.price,
          changePercent: data.changePercent,
          trend: tech.trend,
          sma20: tech.sma20,
          sma60: tech.sma60,
          rsi: tech.rsi,
          isVolumeBurst: tech.isVolumeBurst,
          passed,
        });
      }
    }

    const passed = results.filter(r => r.passed);
    const failed = results.filter(r => !r.passed);

    return NextResponse.json({ results, passed, failed, total: results.length });

  } catch (error: any) {
    console.error('Screener error:', error);
    return NextResponse.json({ error: error.message || '篩選器執行失敗' }, { status: 500 });
  }
}
