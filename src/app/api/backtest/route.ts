import { NextRequest, NextResponse } from 'next/server';
import { SMA, RSI } from 'technicalindicators';
import { fetchChartData } from '@/lib/data-providers';

interface BacktestParams {
  symbol: string;
  startDate: string;
  endDate: string;
  strategy: 'MA_CROSS' | 'RSI' | 'CUSTOM';
  params?: {
    fastPeriod?: number;
    slowPeriod?: number;
    rsiPeriod?: number;
    rsiOversold?: number;
    rsiOverbought?: number;
    entryConditions?: string[];
    exitConditions?: string[];
  };
}

interface TradeRecord {
  type: 'BUY' | 'SELL';
  date: string;
  price: number;
  pnl?: number;
}

interface EquityPoint {
  date: string;
  value: number;
}

const INITIAL_CAPITAL = 100000;

export async function POST(req: NextRequest) {
  try {
    const body: BacktestParams = await req.json();
    const { symbol, startDate, endDate, strategy, params = {} } = body;

    if (!symbol || !startDate || !endDate || !strategy) {
      return NextResponse.json({ error: '缺少必要參數 (symbol, startDate, endDate, strategy)' }, { status: 400 });
    }

    // Calculate days needed (add buffer for indicator warm-up)
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 30) {
      return NextResponse.json({ error: '回測區間至少需要 30 天' }, { status: 400 });
    }

    // Fetch extra warm-up days for indicator calculation
    const warmupDays = 120;
    const totalDays = diffDays + warmupDays;

    // Normalize Taiwan stock symbol
    let querySymbol = symbol.trim();
    if (/^\d{4}$/.test(querySymbol)) querySymbol = `${querySymbol}.TW`;

    const allData = await fetchChartData(querySymbol, 'auto', totalDays);

    if (!allData || allData.length < 30) {
      return NextResponse.json({ error: '歷史資料不足，無法進行回測' }, { status: 400 });
    }

    // Filter to requested date range for output, but keep all for indicator calc
    const filteredData = allData.filter(d => d.date >= startDate && d.date <= endDate);
    if (filteredData.length < 10) {
      return NextResponse.json({ error: '所選區間資料不足' }, { status: 400 });
    }

    const closes = allData.map(d => d.close);
    const dates = allData.map(d => d.date);

    // Find start index in full data
    const startIdx = allData.findIndex(d => d.date >= startDate);
    const endIdx = allData.findIndex(d => d.date > endDate);
    const actualEndIdx = endIdx === -1 ? allData.length - 1 : endIdx - 1;

    // Calculate indicators on full data
    const fastPeriod = params.fastPeriod ?? 5;
    const slowPeriod = params.slowPeriod ?? 20;
    const rsiPeriod = params.rsiPeriod ?? 14;
    const rsiOversold = params.rsiOversold ?? 30;
    const rsiOverbought = params.rsiOverbought ?? 70;

    const smaFast = SMA.calculate({ period: fastPeriod, values: closes });
    const smaSlow = SMA.calculate({ period: slowPeriod, values: closes });
    const sma20 = SMA.calculate({ period: 20, values: closes });
    const sma60 = SMA.calculate({ period: 60, values: closes });
    const rsiValues = RSI.calculate({ period: rsiPeriod, values: closes });

    // Align all indicators to same index
    const maxLag = Math.max(fastPeriod, slowPeriod, rsiPeriod, 60) - 1;

    // Build aligned arrays from maxLag onwards
    const aligned: {
      date: string;
      close: number;
      smaFast: number;
      smaSlow: number;
      sma20: number;
      sma60: number;
      rsi: number;
    }[] = [];

    for (let i = maxLag; i < closes.length; i++) {
      const fastOffset = i - (fastPeriod - 1);
      const slowOffset = i - (slowPeriod - 1);
      const rsiOffset = i - rsiPeriod;
      const sma20Offset = i - 19;
      const sma60Offset = i - 59;

      if (fastOffset < 0 || slowOffset < 0 || rsiOffset < 0 || sma20Offset < 0 || sma60Offset < 0) continue;

      aligned.push({
        date: dates[i],
        close: closes[i],
        smaFast: smaFast[fastOffset] ?? 0,
        smaSlow: smaSlow[slowOffset] ?? 0,
        sma20: sma20[sma20Offset] ?? 0,
        sma60: sma60[sma60Offset] ?? 0,
        rsi: rsiValues[rsiOffset] ?? 50,
      });
    }

    // Filter to requested date range
    const backtestData = aligned.filter(d => d.date >= startDate && d.date <= endDate);

    if (backtestData.length < 5) {
      return NextResponse.json({ error: '指標計算後資料不足，請延長回測區間或減少指標週期' }, { status: 400 });
    }

    // Run backtest simulation
    const trades: TradeRecord[] = [];
    const equityCurve: EquityPoint[] = [];

    let cash = INITIAL_CAPITAL;
    let shares = 0;
    let buyPrice = 0;
    let inPosition = false;

    for (let i = 1; i < backtestData.length; i++) {
      const prev = backtestData[i - 1];
      const curr = backtestData[i];

      let buySignal = false;
      let sellSignal = false;

      if (strategy === 'MA_CROSS') {
        // Golden cross: fast crosses above slow
        const prevCross = prev.smaFast - prev.smaSlow;
        const currCross = curr.smaFast - curr.smaSlow;
        buySignal = prevCross <= 0 && currCross > 0;
        sellSignal = prevCross >= 0 && currCross < 0;

      } else if (strategy === 'RSI') {
        buySignal = !inPosition && prev.rsi < rsiOversold && curr.rsi >= rsiOversold;
        sellSignal = inPosition && prev.rsi < rsiOverbought && curr.rsi >= rsiOverbought;

      } else if (strategy === 'CUSTOM') {
        const entryConditions = params.entryConditions ?? ['above_sma20'];
        const exitConditions = params.exitConditions ?? ['below_sma20'];

        buySignal = !inPosition && entryConditions.every(cond => evaluateCondition(cond, curr));
        sellSignal = inPosition && exitConditions.every(cond => evaluateCondition(cond, curr));
      }

      if (buySignal && !inPosition && cash > 0) {
        shares = Math.floor(cash / curr.close);
        if (shares > 0) {
          buyPrice = curr.close;
          cash -= shares * curr.close;
          inPosition = true;
          trades.push({ type: 'BUY', date: curr.date, price: curr.close });
        }
      } else if (sellSignal && inPosition && shares > 0) {
        const sellValue = shares * curr.close;
        const pnl = (curr.close - buyPrice) * shares;
        cash += sellValue;
        inPosition = false;
        trades.push({ type: 'SELL', date: curr.date, price: curr.close, pnl });
        shares = 0;
      }

      const portfolioValue = cash + shares * curr.close;
      equityCurve.push({ date: curr.date, value: Math.round(portfolioValue * 100) / 100 });
    }

    // Close open position at end
    if (inPosition && shares > 0) {
      const lastClose = backtestData[backtestData.length - 1].close;
      const lastDate = backtestData[backtestData.length - 1].date;
      const pnl = (lastClose - buyPrice) * shares;
      trades.push({ type: 'SELL', date: lastDate, price: lastClose, pnl });
      cash += shares * lastClose;
    }

    // Calculate statistics
    const finalValue = equityCurve.length > 0 ? equityCurve[equityCurve.length - 1].value : INITIAL_CAPITAL;
    const totalReturn = ((finalValue - INITIAL_CAPITAL) / INITIAL_CAPITAL) * 100;

    const sellTrades = trades.filter(t => t.type === 'SELL' && t.pnl !== undefined);
    const winningTrades = sellTrades.filter(t => (t.pnl ?? 0) > 0);
    const winRate = sellTrades.length > 0 ? (winningTrades.length / sellTrades.length) * 100 : 0;

    // Max drawdown
    let peak = INITIAL_CAPITAL;
    let maxDrawdown = 0;
    for (const point of equityCurve) {
      if (point.value > peak) peak = point.value;
      const drawdown = ((peak - point.value) / peak) * 100;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }

    return NextResponse.json({
      symbol: querySymbol,
      trades,
      equityCurve,
      stats: {
        totalReturn: Math.round(totalReturn * 100) / 100,
        winRate: Math.round(winRate * 100) / 100,
        totalTrades: trades.filter(t => t.type === 'BUY').length,
        maxDrawdown: Math.round(maxDrawdown * 100) / 100,
        initialCapital: INITIAL_CAPITAL,
        finalValue: Math.round(finalValue * 100) / 100,
      }
    });

  } catch (error: any) {
    console.error('Backtest error:', error);
    return NextResponse.json({ error: error.message || '回測執行失敗' }, { status: 500 });
  }
}

function evaluateCondition(condition: string, data: { close: number; smaFast: number; smaSlow: number; sma20: number; sma60: number; rsi: number }): boolean {
  switch (condition) {
    case 'above_sma20': return data.close > data.sma20;
    case 'below_sma20': return data.close < data.sma20;
    case 'above_sma60': return data.close > data.sma60;
    case 'below_sma60': return data.close < data.sma60;
    case 'rsi_lt_50': return data.rsi < 50;
    case 'rsi_gt_50': return data.rsi > 50;
    case 'rsi_oversold': return data.rsi < 30;
    case 'rsi_overbought': return data.rsi > 70;
    case 'ma_bullish': return data.smaFast > data.smaSlow;
    case 'ma_bearish': return data.smaFast < data.smaSlow;
    default: return false;
  }
}
