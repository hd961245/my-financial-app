"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface ScreenerResult {
  symbol: string;
  name?: string;
  price?: number;
  changePercent?: number;
  trend?: string;
  sma20?: number;
  sma60?: number;
  rsi?: number;
  isVolumeBurst?: boolean;
  passed: boolean;
  error?: string;
}

const TREND_OPTIONS = [
  { value: 'Strong Bullish', label: '強勢多頭' },
  { value: 'Bullish', label: '多頭排列' },
  { value: 'Neutral', label: '盤整' },
  { value: 'Bearish', label: '空頭排列' },
  { value: 'Strong Bearish', label: '強勢空頭' },
];

export function StockScreener() {
  const [symbolInput, setSymbolInput] = useState('AAPL,MSFT,TSLA,NVDA,AMZN');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ScreenerResult[] | null>(null);
  const [error, setError] = useState('');

  // Filter states
  const [rsiLt, setRsiLt] = useState('');
  const [rsiGt, setRsiGt] = useState('');
  const [selectedTrends, setSelectedTrends] = useState<string[]>([]);
  const [aboveSma20, setAboveSma20] = useState(false);
  const [aboveSma60, setAboveSma60] = useState(false);
  const [volumeBurst, setVolumeBurst] = useState(false);
  const [changeGt, setChangeGt] = useState('');
  const [changeLt, setChangeLt] = useState('');

  const toggleTrend = (val: string) => {
    setSelectedTrends(prev => prev.includes(val) ? prev.filter(t => t !== val) : [...prev, val]);
  };

  const runScreener = async () => {
    setLoading(true);
    setError('');
    setResults(null);

    const symbols = symbolInput
      .split(/[,\n\s]+/)
      .map(s => s.trim().toUpperCase())
      .filter(Boolean);

    if (symbols.length === 0) {
      setError('請輸入至少一個股票代號');
      setLoading(false);
      return;
    }

    const filters: Record<string, unknown> = {};
    if (rsiLt) filters.rsi_lt = Number(rsiLt);
    if (rsiGt) filters.rsi_gt = Number(rsiGt);
    if (selectedTrends.length > 0) filters.trend = selectedTrends;
    if (aboveSma20) filters.above_sma20 = true;
    if (aboveSma60) filters.above_sma60 = true;
    if (volumeBurst) filters.volume_burst = true;
    if (changeGt) filters.change_gt = Number(changeGt);
    if (changeLt) filters.change_lt = Number(changeLt);

    try {
      const res = await fetch('/api/screener', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols, filters }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '篩選失敗');
      } else {
        setResults(data.results);
      }
    } catch {
      setError('網路錯誤，請稍後再試');
    } finally {
      setLoading(false);
    }
  };

  const formatPct = (v?: number) => v !== undefined ? `${(v * 100).toFixed(2)}%` : '---';

  const trendBadgeColor = (trend?: string) => {
    if (!trend) return 'secondary';
    if (trend.includes('Strong Bullish') || trend.includes('強勢多頭')) return 'default';
    if (trend.includes('Bullish') || trend.includes('多頭')) return 'default';
    if (trend.includes('Strong Bearish') || trend.includes('強勢空頭')) return 'destructive';
    if (trend.includes('Bearish') || trend.includes('空頭')) return 'destructive';
    return 'secondary';
  };

  const passedCount = results?.filter(r => r.passed).length ?? 0;
  const totalCount = results?.length ?? 0;

  return (
    <div className="space-y-4">
      {/* Filter Panel */}
      <Card>
        <CardHeader>
          <CardTitle>選股篩選器設定</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Symbol Input */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">股票清單（逗號或換行分隔，最多 20 支）</label>
            <textarea
              value={symbolInput}
              onChange={e => setSymbolInput(e.target.value)}
              rows={2}
              placeholder="AAPL, MSFT, 2330.TW, 2454.TW"
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            />
          </div>

          {/* Filter Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* RSI filters */}
            <div className="space-y-2">
              <p className="text-xs font-medium">RSI 條件</p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-12">RSI &lt;</span>
                <Input type="number" placeholder="例: 50" value={rsiLt} onChange={e => setRsiLt(e.target.value)} className="h-8" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-12">RSI &gt;</span>
                <Input type="number" placeholder="例: 30" value={rsiGt} onChange={e => setRsiGt(e.target.value)} className="h-8" />
              </div>
            </div>

            {/* Price change filters */}
            <div className="space-y-2">
              <p className="text-xs font-medium">漲跌幅條件（%）</p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-16">漲幅 &gt;</span>
                <Input type="number" placeholder="例: 2" value={changeGt} onChange={e => setChangeGt(e.target.value)} className="h-8" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-16">跌幅 &lt;</span>
                <Input type="number" placeholder="例: -2" value={changeLt} onChange={e => setChangeLt(e.target.value)} className="h-8" />
              </div>
            </div>

            {/* Checkbox filters */}
            <div className="space-y-2">
              <p className="text-xs font-medium">均線 / 量能條件</p>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={aboveSma20} onChange={e => setAboveSma20(e.target.checked)} className="rounded" />
                站上 20MA
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={aboveSma60} onChange={e => setAboveSma60(e.target.checked)} className="rounded" />
                站上 60MA
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={volumeBurst} onChange={e => setVolumeBurst(e.target.checked)} className="rounded" />
                量能爆發（&gt; 2倍均量）
              </label>
            </div>
          </div>

          {/* Trend multi-select */}
          <div>
            <p className="text-xs font-medium mb-2">趨勢類型（多選，符合其中一項即通過）</p>
            <div className="flex flex-wrap gap-2">
              {TREND_OPTIONS.map(t => (
                <button
                  key={t.value}
                  onClick={() => toggleTrend(t.value)}
                  className={`px-3 py-1 text-xs rounded-full border transition-colors ${selectedTrends.includes(t.value) ? 'bg-primary text-primary-foreground border-primary' : 'border-muted-foreground/30 text-muted-foreground hover:border-foreground'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-500 bg-red-50 dark:bg-red-950/30 p-2 rounded">{error}</p>}

          <Button onClick={runScreener} disabled={loading} className="w-full md:w-auto">
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                篩選中...
              </span>
            ) : '執行篩選'}
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {results && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              篩選結果
              <Badge variant="default">{passedCount} 符合</Badge>
              <Badge variant="secondary">{totalCount - passedCount} 不符合</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs">
                    <th className="text-left py-2 pr-3">代號</th>
                    <th className="text-left py-2 pr-3">名稱</th>
                    <th className="text-right py-2 pr-3">股價</th>
                    <th className="text-right py-2 pr-3">漲跌%</th>
                    <th className="text-center py-2 pr-3">趨勢</th>
                    <th className="text-right py-2 pr-3">20MA</th>
                    <th className="text-right py-2 pr-3">60MA</th>
                    <th className="text-right py-2 pr-3">RSI</th>
                    <th className="text-center py-2 pr-3">量增</th>
                    <th className="text-center py-2">結果</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => (
                    <tr key={i} className={`border-b last:border-0 hover:bg-muted/30 ${r.passed ? '' : 'opacity-50'}`}>
                      <td className="py-2 pr-3 font-mono font-medium">{r.symbol}</td>
                      <td className="py-2 pr-3 text-muted-foreground text-xs max-w-[120px] truncate">{r.name || '---'}</td>
                      <td className="py-2 pr-3 text-right font-mono">{r.price ? `$${r.price.toFixed(2)}` : '---'}</td>
                      <td className={`py-2 pr-3 text-right font-mono ${(r.changePercent ?? 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {r.changePercent !== undefined ? `${(r.changePercent >= 0 ? '+' : '')}${formatPct(r.changePercent)}` : '---'}
                      </td>
                      <td className="py-2 pr-3 text-center">
                        {r.trend ? (
                          <Badge variant={trendBadgeColor(r.trend)} className="text-xs whitespace-nowrap">
                            {r.trend.split(' (')[0]}
                          </Badge>
                        ) : r.error ? (
                          <span className="text-xs text-red-400">{r.error}</span>
                        ) : '---'}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono text-xs">{r.sma20 ? `$${r.sma20.toFixed(2)}` : '---'}</td>
                      <td className="py-2 pr-3 text-right font-mono text-xs">{r.sma60 ? `$${r.sma60.toFixed(2)}` : '---'}</td>
                      <td className={`py-2 pr-3 text-right font-mono text-xs ${r.rsi !== undefined ? (r.rsi > 70 ? 'text-red-500' : r.rsi < 30 ? 'text-green-500' : '') : ''}`}>
                        {r.rsi !== undefined ? r.rsi.toFixed(1) : '---'}
                      </td>
                      <td className="py-2 pr-3 text-center text-xs">
                        {r.isVolumeBurst ? <span className="text-orange-500">🔥</span> : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="py-2 text-center">
                        {r.passed ? (
                          <Badge variant="default" className="text-xs">✓ 通過</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">✗ 不符</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
