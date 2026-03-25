'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';

interface StockReport {
  id: number;
  ticker: string;
  name: string;
  sector: string;
  content: string;
  wikilinks: string[];
  sourceUrl: string;
  updatedAt: string;
}

interface SupplyChainResult {
  entity: string;
  count: number;
  companies: { ticker: string; name: string; sector: string }[];
}

interface Props {
  // When embedded inside StockHealthAnalyzer, pass a ticker (e.g. "2330" from "2330.TW")
  initialTicker?: string;
}

export default function TaiwanCoverageReport({ initialTicker }: Props) {
  const [report, setReport] = useState<StockReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(initialTicker ?? '');
  const [supplyChainEntity, setSupplyChainEntity] = useState('');
  const [supplyChainResult, setSupplyChainResult] = useState<SupplyChainResult | null>(null);
  const [scLoading, setScLoading] = useState(false);
  const [dbStats, setDbStats] = useState<{ total: number } | null>(null);

  const fetchReport = useCallback(async (ticker: string) => {
    if (!ticker) return;
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const res = await fetch(`/api/tw-coverage?ticker=${encodeURIComponent(ticker)}`);
      if (!res.ok) {
        const data = await res.json();
        setError(data.error === 'Report not found' ? `找不到 ${ticker} 的研究報告` : data.error);
        return;
      }
      setReport(await res.json());
    } catch {
      setError('無法載入報告，請稍後再試');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSupplyChain = async () => {
    if (!supplyChainEntity.trim()) return;
    setScLoading(true);
    setSupplyChainResult(null);
    try {
      const res = await fetch(`/api/tw-coverage/supply-chain?entity=${encodeURIComponent(supplyChainEntity.trim())}`);
      if (res.ok) setSupplyChainResult(await res.json());
    } finally {
      setScLoading(false);
    }
  };

  // Load DB stats on mount
  useEffect(() => {
    fetch('/api/tw-coverage')
      .then((r) => r.json())
      .then((d) => setDbStats({ total: d.total ?? 0 }))
      .catch(() => {});
  }, []);

  // Auto-load if ticker is provided
  useEffect(() => {
    if (initialTicker) fetchReport(initialTicker);
  }, [initialTicker, fetchReport]);

  const renderMarkdown = (content: string) => {
    // Simple markdown-to-HTML renderer for report content
    return content
      .split('\n')
      .map((line, i) => {
        if (line.startsWith('## ')) return <h2 key={i} className="text-base font-semibold mt-4 mb-1 text-foreground">{line.slice(3)}</h2>;
        if (line.startsWith('### ')) return <h3 key={i} className="text-sm font-semibold mt-3 mb-1 text-foreground">{line.slice(4)}</h3>;
        if (line.startsWith('# ')) return <h1 key={i} className="text-lg font-bold mt-2 mb-2 text-foreground">{line.slice(2)}</h1>;
        if (line.startsWith('- ') || line.startsWith('* ')) {
          return (
            <li key={i} className="ml-4 text-sm text-muted-foreground list-disc">
              {renderInline(line.slice(2))}
            </li>
          );
        }
        if (line.startsWith('|')) {
          // Table row
          const cells = line.split('|').filter((c) => c.trim() !== '');
          if (cells.every((c) => /^[-: ]+$/.test(c))) return null; // separator row
          return (
            <tr key={i} className="border-b border-border">
              {cells.map((cell, j) => (
                <td key={j} className="px-2 py-1 text-xs text-muted-foreground">{cell.trim()}</td>
              ))}
            </tr>
          );
        }
        if (line.trim() === '') return <div key={i} className="h-1" />;
        return <p key={i} className="text-sm text-muted-foreground leading-relaxed">{renderInline(line)}</p>;
      });
  };

  const renderInline = (text: string) => {
    // Render [[wikilinks]] as highlighted badges
    const parts = text.split(/(\[\[[^\]]+\]\])/g);
    return parts.map((part, i) => {
      const match = part.match(/^\[\[(.+)\]\]$/);
      if (match) {
        return (
          <button
            key={i}
            className="inline-block mx-0.5 px-1 py-0 text-xs rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
            onClick={() => setSupplyChainEntity(match[1])}
          >
            {match[1]}
          </button>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  const isTableSection = (content: string) => content.includes('|');

  return (
    <div className="space-y-4">
      {/* Header / Stats */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium">台股研究報告庫</span>
        {dbStats && (
          <Badge variant="secondary" className="text-xs">
            {dbStats.total.toLocaleString()} 家公司
          </Badge>
        )}
        {dbStats?.total === 0 && (
          <span className="text-xs text-amber-600 dark:text-amber-400">
            資料庫尚無資料，請先執行 import 腳本
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Report Search */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">查詢公司報告</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex gap-2">
              <Input
                placeholder="輸入股票代號，例如 2330"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchReport(searchQuery.trim())}
                className="text-sm"
              />
              <Button size="sm" onClick={() => fetchReport(searchQuery.trim())} disabled={loading}>
                {loading ? '載入中...' : '查詢'}
              </Button>
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </CardContent>
        </Card>

        {/* Supply Chain Search */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">供應鏈搜尋</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex gap-2">
              <Input
                placeholder="輸入品牌或公司，例如 Apple"
                value={supplyChainEntity}
                onChange={(e) => setSupplyChainEntity(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchSupplyChain()}
                className="text-sm"
              />
              <Button size="sm" onClick={fetchSupplyChain} disabled={scLoading}>
                {scLoading ? '搜尋中...' : '搜尋'}
              </Button>
            </div>
            {supplyChainResult && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  找到 <strong>{supplyChainResult.count}</strong> 家台廠與 &quot;{supplyChainResult.entity}&quot; 相關
                </p>
                <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                  {supplyChainResult.companies.map((c) => (
                    <button
                      key={c.ticker}
                      className="text-xs px-2 py-0.5 rounded border border-border hover:bg-muted transition-colors"
                      onClick={() => {
                        setSearchQuery(c.ticker);
                        fetchReport(c.ticker);
                      }}
                    >
                      {c.ticker} {c.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Report Content */}
      {report && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-base">
                  {report.ticker} {report.name}
                </CardTitle>
                <div className="flex gap-2 mt-1">
                  <Badge variant="outline" className="text-xs">{report.sector}</Badge>
                  <span className="text-xs text-muted-foreground">
                    更新：{new Date(report.updatedAt).toLocaleDateString('zh-TW')}
                  </span>
                </div>
              </div>
              <a
                href={report.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-500 hover:underline"
              >
                原始檔案 ↗
              </a>
            </div>
          </CardHeader>
          <CardContent>
            {/* Wikilinks summary */}
            {report.wikilinks.length > 0 && (
              <div className="mb-3">
                <p className="text-xs text-muted-foreground mb-1">
                  關鍵實體（{report.wikilinks.length} 個，點擊可搜尋供應鏈）
                </p>
                <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
                  {report.wikilinks.slice(0, 30).map((wl) => (
                    <button
                      key={wl}
                      className="text-xs px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
                      onClick={() => {
                        setSupplyChainEntity(wl);
                        fetchSupplyChain();
                      }}
                    >
                      {wl}
                    </button>
                  ))}
                  {report.wikilinks.length > 30 && (
                    <span className="text-xs text-muted-foreground">+{report.wikilinks.length - 30} 更多</span>
                  )}
                </div>
              </div>
            )}

            {/* Full report content */}
            <ScrollArea className="h-96">
              <div className="pr-4 space-y-0.5">
                {isTableSection(report.content) ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <tbody>{renderMarkdown(report.content)}</tbody>
                    </table>
                  </div>
                ) : (
                  <div>{renderMarkdown(report.content)}</div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
