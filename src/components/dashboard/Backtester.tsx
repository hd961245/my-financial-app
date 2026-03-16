"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine
} from 'recharts';

type Strategy = 'MA_CROSS' | 'RSI' | 'CUSTOM';

interface TradeRecord {
  type: 'BUY' | 'SELL';
  date: string;
  price: number;
  pnl?: number;
}

interface BacktestResult {
  symbol: string;
  trades: TradeRecord[];
  equityCurve: { date: string; value: number }[];
  stats: {
    totalReturn: number;
    winRate: number;
    totalTrades: number;
    maxDrawdown: number;
    initialCapital: number;
    finalValue: number;
  };
}

const CUSTOM_CONDITIONS = [
  { value: 'above_sma20', label: '站上 20MA' },
  { value: 'above_sma60', label: '站上 60MA' },
  { value: 'below_sma20', label: '跌破 20MA' },
  { value: 'below_sma60', label: '跌破 60MA' },
  { value: 'rsi_lt_50', label: 'RSI < 50' },
  { value: 'rsi_gt_50', label: 'RSI > 50' },
  { value: 'rsi_oversold', label: 'RSI 超賣 (< 30)' },
  { value: 'rsi_overbought', label: 'RSI 超買 (> 70)' },
  { value: 'ma_bullish', label: '快線 > 慢線' },
  { value: 'ma_bearish', label: '快線 < 慢線' },
];

export function Backtester() {
  const [symbol, setSymbol] = useState('AAPL');
  const [startDate, setStartDate] = useState('2023-01-01');
  const [endDate, setEndDate] = useState('2024-01-01');
  const [strategy, setStrategy] = useState<Strategy>('MA_CROSS');
  const [fastPeriod, setFastPeriod] = useState(5);
  const [slowPeriod, setSlowPeriod] = useState(20);
  const [rsiOversold, setRsiOversold] = useState(30);
  const [rsiOverbought, setRsiOverbought] = useState(70);
  const [entryConditions, setEntryConditions] = useState<string[]>(['above_sma20', 'rsi_lt_50']);
  const [exitConditions, setExitConditions] = useState<string[]>(['below_sma20']);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState('');

  const toggleCondition = (list: string[], setList: (v: string[]) => void, val: string) => {
    setList(list.includes(val) ? list.filter(c => c !== val) : [...list, val]);
  };

  const runBacktest = async () => {
    setLoading(true);
    setError('');
    setResult(null);

    const payload: Record<string, unknown> = {
      symbol,
      startDate,
      endDate,
      strategy,
      params: {}
    };

    if (strategy === 'MA_CROSS') {
      (payload.params as Record<string, unknown>).fastPeriod = fastPeriod;
      (payload.params as Record<string, unknown>).slowPeriod = slowPeriod;
    } else if (strategy === 'RSI') {
      (payload.params as Record<string, unknown>).rsiOversold = rsiOversold;
      (payload.params as Record<string, unknown>).rsiOverbought = rsiOverbought;
    } else if (strategy === 'CUSTOM') {
      (payload.params as Record<string, unknown>).entryConditions = entryConditions;
      (payload.params as Record<string, unknown>).exitConditions = exitConditions;
    }

    try {
      const res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '回測失敗');
      } else {
        setResult(data);
      }
    } catch {
      setError('網路錯誤，請稍後再試');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (v: number) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  return (
    <div className="space-y-4">
      {/* Settings Card */}
      <Card>
        <CardHeader>
          <CardTitle>策略回測設定</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">股票代號</label>
              <Input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} placeholder="AAPL / 2330" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">開始日期</label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">結束日期</label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">策略</label>
              <select
                value={strategy}
                onChange={e => setStrategy(e.target.value as Strategy)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="MA_CROSS">均線交叉</option>
                <option value="RSI">RSI 超買超賣</option>
                <option value="CUSTOM">自訂條件</option>
              </select>
            </div>
          </div>

          {/* Strategy-specific params */}
          {strategy === 'MA_CROSS' && (
            <div className="grid grid-cols-2 gap-4 p-3 bg-muted/50 rounded-md">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">快線週期（天）</label>
                <Input type="number" min={2} max={50} value={fastPeriod} onChange={e => setFastPeriod(Number(e.target.value))} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">慢線週期（天）</label>
                <Input type="number" min={5} max={200} value={slowPeriod} onChange={e => setSlowPeriod(Number(e.target.value))} />
              </div>
              <p className="col-span-2 text-xs text-muted-foreground">
                進場：快線上穿慢線（黃金交叉）｜出場：快線下穿慢線（死亡交叉）
              </p>
            </div>
          )}

          {strategy === 'RSI' && (
            <div className="grid grid-cols-2 gap-4 p-3 bg-muted/50 rounded-md">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">超賣門檻（RSI 買入）</label>
                <Input type="number" min={10} max={40} value={rsiOversold} onChange={e => setRsiOversold(Number(e.target.value))} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">超買門檻（RSI 賣出）</label>
                <Input type="number" min={60} max={90} value={rsiOverbought} onChange={e => setRsiOverbought(Number(e.target.value))} />
              </div>
              <p className="col-span-2 text-xs text-muted-foreground">
                進場：RSI 從超賣區反彈向上穿越門檻｜出場：RSI 從超買區向上穿越門檻
              </p>
            </div>
          )}

          {strategy === 'CUSTOM' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 bg-muted/50 rounded-md">
              <div>
                <p className="text-xs font-medium mb-2">進場條件（AND 邏輯）</p>
                <div className="flex flex-wrap gap-2">
                  {CUSTOM_CONDITIONS.map(c => (
                    <button
                      key={c.value}
                      onClick={() => toggleCondition(entryConditions, setEntryConditions, c.value)}
                      className={`px-2 py-1 text-xs rounded border transition-colors ${entryConditions.includes(c.value) ? 'bg-green-500/20 border-green-500 text-green-700 dark:text-green-400' : 'border-muted-foreground/30 text-muted-foreground hover:border-foreground'}`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-medium mb-2">出場條件（AND 邏輯）</p>
                <div className="flex flex-wrap gap-2">
                  {CUSTOM_CONDITIONS.map(c => (
                    <button
                      key={c.value}
                      onClick={() => toggleCondition(exitConditions, setExitConditions, c.value)}
                      className={`px-2 py-1 text-xs rounded border transition-colors ${exitConditions.includes(c.value) ? 'bg-red-500/20 border-red-500 text-red-700 dark:text-red-400' : 'border-muted-foreground/30 text-muted-foreground hover:border-foreground'}`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-500 bg-red-50 dark:bg-red-950/30 p-2 rounded">{error}</p>
          )}

          <Button onClick={runBacktest} disabled={loading} className="w-full md:w-auto">
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                回測執行中...
              </span>
            ) : '執行回測'}
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {result && (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">總報酬率</p>
                <p className={`text-2xl font-bold ${result.stats.totalReturn >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {result.stats.totalReturn >= 0 ? '+' : ''}{result.stats.totalReturn}%
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatCurrency(result.stats.initialCapital)} → {formatCurrency(result.stats.finalValue)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">勝率</p>
                <p className={`text-2xl font-bold ${result.stats.winRate >= 50 ? 'text-green-500' : 'text-amber-500'}`}>
                  {result.stats.winRate}%
                </p>
                <p className="text-xs text-muted-foreground mt-1">獲利交易 / 總交易</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">最大回撤</p>
                <p className="text-2xl font-bold text-red-500">-{result.stats.maxDrawdown}%</p>
                <p className="text-xs text-muted-foreground mt-1">峰值至谷底最大跌幅</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">交易次數</p>
                <p className="text-2xl font-bold">{result.stats.totalTrades}</p>
                <p className="text-xs text-muted-foreground mt-1">買入 {result.stats.totalTrades} 次</p>
              </CardContent>
            </Card>
          </div>

          {/* Equity Curve */}
          <Card>
            <CardHeader>
              <CardTitle>資金曲線 — {result.symbol}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={result.equityCurve}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={d => d.slice(5)}
                      interval="preserveStartEnd"
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis
                      tickFormatter={v => `$${(v / 1000).toFixed(0)}k`}
                      tick={{ fontSize: 11 }}
                      width={55}
                    />
                    <Tooltip
                      formatter={(v: number | undefined) => [v != null ? formatCurrency(v) : '', '資金']}
                      labelFormatter={d => `日期：${d}`}
                    />
                    <ReferenceLine y={100000} stroke="#6b7280" strokeDasharray="4 4" label={{ value: '初始資金', position: 'insideTopRight', fontSize: 11 }} />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke={result.stats.totalReturn >= 0 ? '#10b981' : '#ef4444'}
                      dot={false}
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Trade Records */}
          <Card>
            <CardHeader>
              <CardTitle>交易記錄</CardTitle>
            </CardHeader>
            <CardContent>
              {result.trades.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">此區間內無交易觸發</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground text-xs">
                        <th className="text-left py-2 pr-4">日期</th>
                        <th className="text-left py-2 pr-4">方向</th>
                        <th className="text-right py-2 pr-4">成交價</th>
                        <th className="text-right py-2">損益</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.trades.map((t, i) => (
                        <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="py-2 pr-4 font-mono text-xs">{t.date}</td>
                          <td className="py-2 pr-4">
                            <Badge variant={t.type === 'BUY' ? 'default' : 'secondary'}>
                              {t.type === 'BUY' ? '買入' : '賣出'}
                            </Badge>
                          </td>
                          <td className="py-2 pr-4 text-right font-mono">${t.price.toFixed(2)}</td>
                          <td className={`py-2 text-right font-mono font-medium ${t.pnl !== undefined ? (t.pnl >= 0 ? 'text-green-500' : 'text-red-500') : 'text-muted-foreground'}`}>
                            {t.pnl !== undefined ? `${t.pnl >= 0 ? '+' : ''}$${t.pnl.toFixed(0)}` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
