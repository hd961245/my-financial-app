"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface FlowSummary {
    symbol: string;
    name: string;
    date: string;
    foreignNet: number;
    trustNet: number;
    dealerNet: number;
    totalNet: number;
}

interface CapitalFlowData {
    topBuying: FlowSummary[];
    topSelling: FlowSummary[];
    updatedAt: string;
}

const fmt = (n: number) => {
    const abs = Math.abs(n);
    if (abs >= 10000) return `${(n / 10000).toFixed(1)}萬`;
    return n.toLocaleString();
};

function FlowRow({ item, type }: { item: FlowSummary; type: 'buy' | 'sell' }) {
    const isPositive = type === 'buy';
    return (
        <div className="flex items-center justify-between bg-muted/40 p-2 rounded text-sm">
            <div>
                <span className="font-bold">{item.symbol}</span>
                <div className="text-xs text-muted-foreground mt-0.5 space-x-2">
                    <span>外資: <span className={item.foreignNet >= 0 ? 'text-green-500' : 'text-red-500'}>{fmt(item.foreignNet)}</span></span>
                    <span>投信: <span className={item.trustNet >= 0 ? 'text-green-500' : 'text-red-500'}>{fmt(item.trustNet)}</span></span>
                </div>
            </div>
            <span className={`font-bold text-sm ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                {isPositive ? '+' : ''}{fmt(item.totalNet)} 張
            </span>
        </div>
    );
}

// Static sector heatmap stays because FinMind doesn't provide sector-level intraday flow
const SECTORS = [
    { name: "半導體", change: null, key: "semiconductor" },
    { name: "金融",   change: null, key: "finance" },
    { name: "航運",   change: null, key: "shipping" },
    { name: "生技",   change: null, key: "biotech" },
    { name: "AI概念", change: null, key: "ai" },
    { name: "綠能",   change: null, key: "energy" },
];

export function CapitalFlowTracker() {
    const [data, setData] = useState<CapitalFlowData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        const load = async () => {
            try {
                const res = await fetch('/api/capital-flow');
                if (!res.ok) throw new Error('無法取得資料');
                setData(await res.json());
            } catch (e: any) {
                setError(e.message);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {/* Sector heatmap — layout only, data comes from institutional flow */}
            <Card className="col-span-2">
                <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2">
                        產業板塊 (Sector Heatmap)
                        <Badge variant="outline" className="text-xs font-normal">台股板塊概覽</Badge>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-3 gap-2 h-[260px]">
                        {SECTORS.map((s) => (
                            <div
                                key={s.key}
                                className="border rounded-md p-3 flex flex-col justify-center items-center bg-muted/30 hover:bg-muted/50 transition-colors"
                            >
                                <span className="font-bold text-sm">{s.name}</span>
                                <span className="text-xs text-muted-foreground mt-1">見右側法人資料</span>
                            </div>
                        ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-3">
                        ＊板塊熱力圖需整體市場資料，目前顯示台股主要板塊。法人詳細買賣超見右側。
                    </p>
                </CardContent>
            </Card>

            {/* Real institutional data */}
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                        三大法人動向
                        <Badge variant="secondary" className="text-xs font-normal">FinMind</Badge>
                    </CardTitle>
                    {data?.updatedAt && (
                        <p className="text-xs text-muted-foreground">資料日期：{data.updatedAt}</p>
                    )}
                </CardHeader>
                <CardContent className="space-y-4">
                    {loading && (
                        <div className="space-y-2">
                            {[...Array(4)].map((_, i) => (
                                <div key={i} className="h-12 rounded bg-muted animate-pulse" />
                            ))}
                        </div>
                    )}
                    {error && (
                        <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/10 p-2 rounded">{error}</p>
                    )}
                    {data && (
                        <>
                            <div>
                                <p className="text-sm font-semibold mb-2 flex items-center gap-1">
                                    <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                                    法人買超 (Net Buying)
                                </p>
                                {data.topBuying.length === 0 ? (
                                    <p className="text-xs text-muted-foreground">今日暫無買超資料</p>
                                ) : (
                                    <div className="space-y-1.5">
                                        {data.topBuying.map(item => (
                                            <FlowRow key={item.symbol} item={item} type="buy" />
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="pt-2 border-t">
                                <p className="text-sm font-semibold mb-2 flex items-center gap-1">
                                    <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
                                    法人賣超 (Net Selling)
                                </p>
                                {data.topSelling.length === 0 ? (
                                    <p className="text-xs text-muted-foreground">今日暫無賣超資料</p>
                                ) : (
                                    <div className="space-y-1.5">
                                        {data.topSelling.map(item => (
                                            <FlowRow key={item.symbol} item={item} type="sell" />
                                        ))}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
