import { useState, useEffect } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Activity, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface StockChartProps {
    symbol: string;
}

export function StockChart({ symbol }: StockChartProps) {
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [provider, setProvider] = useState<'auto' | 'yahoo' | 'finmind'>('auto');
    const [activeProvider, setActiveProvider] = useState<string>("");

    const fetchChartData = async (selectedProvider: 'auto' | 'yahoo' | 'finmind') => {
        setLoading(true);
        setError("");
        setData([]);

        try {
            const res = await fetch(`/api/analyze/chart?symbol=${symbol}&provider=${selectedProvider}`);
            const result = await res.json();

            if (!res.ok) {
                throw new Error(result.error || "無法取得線圖資料");
            }

            setData(result.data);
            setActiveProvider(result.provider); // The backend returns which provider it actually used
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchChartData(provider);
    }, [symbol, provider]);

    return (
        <div className="w-full flex flex-col space-y-4">
            <div className="flex justify-between items-center px-1">
                <div className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    資料來源:
                    <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-800 dark:text-slate-200">
                        {activeProvider === 'yahoo' ? 'Yahoo Finance' : activeProvider === 'finmind' ? 'FinMind' : '自動選擇中...'}
                    </span>
                </div>
                <div className="flex gap-2 text-xs">
                    <Button
                        variant={provider === 'auto' ? 'default' : 'outline'}
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => setProvider('auto')}
                    >
                        自動 (推薦)
                    </Button>
                    <Button
                        variant={provider === 'finmind' ? 'default' : 'outline'}
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => setProvider('finmind')}
                    >
                        FinMind (台股)
                    </Button>
                    <Button
                        variant={provider === 'yahoo' ? 'default' : 'outline'}
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => setProvider('yahoo')}
                    >
                        Yahoo
                    </Button>
                </div>
            </div>

            <div className="h-[300px] w-full border rounded-lg bg-white dark:bg-slate-900 p-4 flex items-center justify-center relative">
                {loading ? (
                    <div className="absolute inset-0 p-4 flex flex-col justify-end gap-1 overflow-hidden rounded-lg">
                        {/* Simulated chart bars */}
                        <div className="flex items-end gap-[2px] h-full w-full">
                            {[40,55,48,62,70,58,65,72,60,78,82,75,88,80,92,85,90,95,88,100,92,85,96,89,94].map((h, i) => (
                                <div key={i} className="flex-1 rounded-sm bg-muted animate-pulse" style={{ height: `${h}%`, animationDelay: `${i * 40}ms` }} />
                            ))}
                        </div>
                        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 text-muted-foreground">
                            <Activity className="h-4 w-4 animate-spin text-blue-500" />
                            <p className="text-xs">正在繪製股價走勢...</p>
                        </div>
                    </div>
                ) : error ? (
                    <div className="flex items-center gap-2 text-red-500 bg-red-50 dark:bg-red-900/10 p-4 rounded-md">
                        <AlertCircle className="h-5 w-5" />
                        <p className="text-sm">{error}</p>
                    </div>
                ) : data.length === 0 ? (
                    <div className="text-muted-foreground text-sm">此股票暫無歷史價格資料</div>
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data}>
                            <defs>
                                <linearGradient id="colorClose" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.2} />
                            <XAxis
                                dataKey="date"
                                tickFormatter={(val) => {
                                    // Make date shorter, e.g., '2023-10-01' -> '10/01'
                                    const parts = val.split('-');
                                    return parts.length === 3 ? `${parts[1]}/${parts[2]}` : val;
                                }}
                                minTickGap={30}
                                fontSize={12}
                                strokeOpacity={0.5}
                            />
                            <YAxis
                                domain={['auto', 'auto']}
                                tickFormatter={(val) => `$${val}`}
                                width={50}
                                fontSize={12}
                                strokeOpacity={0.5}
                            />
                            <Tooltip
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                labelFormatter={(label) => `日期: ${label}`}
                                formatter={(value: any) => [`$${value}`, '收盤價']}
                            />
                            <Area
                                type="monotone"
                                dataKey="close"
                                stroke="#3b82f6"
                                strokeWidth={2}
                                fillOpacity={1}
                                fill="url(#colorClose)"
                                isAnimationActive={true}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                )}
            </div>
        </div>
    );
}
