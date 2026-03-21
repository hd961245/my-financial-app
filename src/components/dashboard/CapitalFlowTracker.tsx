"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface FlowSummary {
    symbol: string; date: string;
    foreignNet: number; trustNet: number; dealerNet: number; totalNet: number;
}
interface MarginSummary {
    symbol: string; date: string;
    marginBalance: number; marginChange: number;
    shortBalance: number; shortChange: number;
    marginRatio: number;
}
interface FuturesSummary {
    date: string;
    foreign: { long: number; short: number; net: number };
    trust:   { long: number; short: number; net: number };
    dealer:  { long: number; short: number; net: number };
    totalNet: number;
}
interface CapitalFlowData {
    institutional: { topBuying: FlowSummary[]; topSelling: FlowSummary[]; updatedAt: string };
    margin:        { top: MarginSummary[]; updatedAt: string };
    futures:       FuturesSummary | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number, decimals = 0) => {
    const abs = Math.abs(n);
    if (abs >= 10000) return `${(n / 10000).toFixed(1)}萬`;
    return n.toLocaleString(undefined, { maximumFractionDigits: decimals });
};

const SignBadge = ({ n, suffix = '張' }: { n: number; suffix?: string }) => (
    <span className={`font-bold text-sm ${n > 0 ? 'text-green-500' : n < 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
        {n > 0 ? '+' : ''}{fmt(n)} {suffix}
    </span>
);

const NetIcon = ({ n }: { n: number }) =>
    n > 0 ? <TrendingUp className="h-4 w-4 text-green-500" />
          : n < 0 ? <TrendingDown className="h-4 w-4 text-red-500" />
          : <Minus className="h-4 w-4 text-muted-foreground" />;

function DataDate({ date }: { date?: string }) {
    if (!date) return null;
    return <p className="text-xs text-muted-foreground mt-0.5">資料日期：{date}</p>;
}

function LoadingSkeleton({ rows = 4 }: { rows?: number }) {
    return (
        <div className="space-y-2">
            {[...Array(rows)].map((_, i) => (
                <div key={i} className="h-12 rounded bg-muted animate-pulse" style={{ animationDelay: `${i * 80}ms` }} />
            ))}
        </div>
    );
}

// ── Sub-panels ────────────────────────────────────────────────────────────────

function InstitutionalPanel({ data }: { data: CapitalFlowData['institutional'] }) {
    return (
        <div className="space-y-4">
            <DataDate date={data.updatedAt} />
            <div>
                <p className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> 三大法人合計買超
                </p>
                {data.topBuying.length === 0
                    ? <p className="text-xs text-muted-foreground">今日暫無買超資料</p>
                    : <div className="space-y-1.5">
                        {data.topBuying.map(item => (
                            <div key={item.symbol} className="flex items-center justify-between bg-muted/40 p-2 rounded text-sm">
                                <div>
                                    <span className="font-bold">{item.symbol}</span>
                                    <div className="text-xs text-muted-foreground mt-0.5 flex gap-2">
                                        <span>外資 <SignBadge n={item.foreignNet} /></span>
                                        <span>投信 <SignBadge n={item.trustNet} /></span>
                                    </div>
                                </div>
                                <SignBadge n={item.totalNet} />
                            </div>
                        ))}
                    </div>
                }
            </div>
            <div className="pt-3 border-t">
                <p className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> 三大法人合計賣超
                </p>
                {data.topSelling.length === 0
                    ? <p className="text-xs text-muted-foreground">今日暫無賣超資料</p>
                    : <div className="space-y-1.5">
                        {data.topSelling.map(item => (
                            <div key={item.symbol} className="flex items-center justify-between bg-muted/40 p-2 rounded text-sm">
                                <div>
                                    <span className="font-bold">{item.symbol}</span>
                                    <div className="text-xs text-muted-foreground mt-0.5 flex gap-2">
                                        <span>外資 <SignBadge n={item.foreignNet} /></span>
                                        <span>投信 <SignBadge n={item.trustNet} /></span>
                                    </div>
                                </div>
                                <SignBadge n={item.totalNet} />
                            </div>
                        ))}
                    </div>
                }
            </div>
        </div>
    );
}

function MarginPanel({ data }: { data: CapitalFlowData['margin'] }) {
    return (
        <div className="space-y-2">
            <DataDate date={data.updatedAt} />
            <div className="grid grid-cols-4 gap-1 text-xs text-muted-foreground font-medium px-2 py-1 bg-muted/30 rounded">
                <span>代號</span>
                <span className="text-right">融資餘額</span>
                <span className="text-right">融資增減</span>
                <span className="text-right">融券餘額</span>
            </div>
            {data.top.length === 0
                ? <p className="text-xs text-muted-foreground p-2">暫無融資融券資料</p>
                : data.top.map(item => (
                    <div key={item.symbol} className="grid grid-cols-4 gap-1 items-center bg-muted/30 p-2 rounded text-sm">
                        <span className="font-bold text-xs">{item.symbol.replace('.TW', '')}</span>
                        <span className="text-right text-xs">{fmt(item.marginBalance)}</span>
                        <span className={`text-right text-xs font-medium ${item.marginChange > 0 ? 'text-green-500' : item.marginChange < 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                            {item.marginChange > 0 ? '+' : ''}{fmt(item.marginChange)}
                        </span>
                        <span className="text-right text-xs">{fmt(item.shortBalance)}</span>
                    </div>
                ))
            }
            <p className="text-xs text-muted-foreground pt-1">融資增加=散戶看多加碼；融券增加=看空放空增加</p>
        </div>
    );
}

function FuturesPanel({ data }: { data: FuturesSummary | null }) {
    if (!data) return <p className="text-sm text-muted-foreground p-4">暫無台指期資料</p>;

    const rows = [
        { label: '外資', color: 'text-blue-500', ...data.foreign },
        { label: '投信', color: 'text-purple-500', ...data.trust },
        { label: '自營商', color: 'text-orange-500', ...data.dealer },
    ];

    const totalNet = data.totalNet;
    const sentiment = totalNet > 5000 ? { text: '大幅偏多', color: 'text-green-500' }
                    : totalNet > 0    ? { text: '偏多', color: 'text-green-400' }
                    : totalNet < -5000 ? { text: '大幅偏空', color: 'text-red-500' }
                    : totalNet < 0    ? { text: '偏空', color: 'text-red-400' }
                    : { text: '中性', color: 'text-yellow-500' };

    return (
        <div className="space-y-4">
            <DataDate date={data.date} />

            {/* Overall sentiment */}
            <div className="rounded-lg border p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">三大法人台指期淨倉位</p>
                <div className="flex items-center justify-center gap-2">
                    <NetIcon n={totalNet} />
                    <span className={`text-2xl font-bold ${sentiment.color}`}>{sentiment.text}</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                    合計淨多單：<SignBadge n={totalNet} suffix="口" />
                </p>
            </div>

            {/* Per institution breakdown */}
            <div className="space-y-2">
                {rows.map(row => (
                    <div key={row.label} className="bg-muted/40 rounded-lg p-3">
                        <div className="flex justify-between items-center mb-2">
                            <span className={`font-bold text-sm ${row.color}`}>{row.label}</span>
                            <SignBadge n={row.net} suffix="口" />
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                            <div className="bg-green-500/10 rounded p-1.5 text-center">
                                <div className="font-medium text-green-600 dark:text-green-400">{fmt(row.long)}</div>
                                <div>多方未平倉</div>
                            </div>
                            <div className="bg-red-500/10 rounded p-1.5 text-center">
                                <div className="font-medium text-red-600 dark:text-red-400">{fmt(row.short)}</div>
                                <div>空方未平倉</div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
            <p className="text-xs text-muted-foreground">外資期貨淨多單為領先指標：轉空時大盤通常提前反應</p>
        </div>
    );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function CapitalFlowTracker() {
    const [flowData, setFlowData] = useState<CapitalFlowData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        fetch('/api/capital-flow')
            .then(r => r.ok ? r.json() : Promise.reject('fetch error'))
            .then(setFlowData)
            .catch(() => setError('無法取得資金動向，請稍後再試'))
            .finally(() => setLoading(false));
    }, []);

    return (
        <div className="grid gap-4 lg:grid-cols-3">
            {/* Left: Sector overview (layout) */}
            <Card className="lg:col-span-1">
                <CardHeader className="pb-2">
                    <CardTitle className="text-base">產業板塊概覽</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 gap-2">
                        {[
                            { name: '半導體', key: 'semi' },
                            { name: 'AI 概念', key: 'ai' },
                            { name: '金融', key: 'fin' },
                            { name: '航運', key: 'ship' },
                            { name: '生技', key: 'bio' },
                            { name: '綠能', key: 'green' },
                        ].map(s => (
                            <div key={s.key} className="border rounded p-3 text-center bg-muted/30 hover:bg-muted/50 transition-colors">
                                <p className="text-sm font-medium">{s.name}</p>
                                <p className="text-xs text-muted-foreground mt-1">見右側法人資料</p>
                            </div>
                        ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-3">板塊即時漲跌需整體市場資料流，目前以法人買賣超代替</p>
                </CardContent>
            </Card>

            {/* Right: Data tabs */}
            <Card className="lg:col-span-2">
                <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                        資金動向詳細數據
                        <Badge variant="secondary" className="text-xs font-normal">FinMind</Badge>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {error && (
                        <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/10 p-3 rounded">{error}</p>
                    )}
                    {loading ? (
                        <LoadingSkeleton rows={5} />
                    ) : flowData ? (
                        <Tabs defaultValue="institutional">
                            <TabsList className="w-full mb-4">
                                <TabsTrigger value="institutional" className="flex-1">法人現貨</TabsTrigger>
                                <TabsTrigger value="margin" className="flex-1">融資融券</TabsTrigger>
                                <TabsTrigger value="futures" className="flex-1">期貨大戶</TabsTrigger>
                            </TabsList>

                            <TabsContent value="institutional">
                                <InstitutionalPanel data={flowData.institutional} />
                            </TabsContent>

                            <TabsContent value="margin">
                                <MarginPanel data={flowData.margin} />
                            </TabsContent>

                            <TabsContent value="futures">
                                <FuturesPanel data={flowData.futures} />
                            </TabsContent>
                        </Tabs>
                    ) : null}
                </CardContent>
            </Card>
        </div>
    );
}
