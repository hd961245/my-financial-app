"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, ChevronLeft, ChevronRight, Zap, TrendingUp, Eye, FileText, Star } from "lucide-react";

interface Recommendation {
    id: number;
    date: string;
    symbol: string;
    name: string;
    action: string;
    reason: string;
    price: number;
    trend: string;
    rsi: number | null;
    isHolding: boolean;
}

interface DailyReport {
    summary: string;
    fullReport: string;
    spotlight: { symbol: string; reason: string }[];
}

const ACTION_CONFIG: Record<string, { label: string; emoji: string; color: string }> = {
    STRONG_BUY: { label: '強力買入', emoji: '⬆️', color: 'bg-green-600 text-white' },
    BUY:        { label: '建議買入', emoji: '🟢', color: 'bg-green-500 text-white' },
    HOLD:       { label: '繼續持有', emoji: '✅', color: 'bg-blue-500 text-white' },
    WATCH:      { label: '繼續觀察', emoji: '🟡', color: 'bg-yellow-500 text-black' },
    REDUCE:     { label: '考慮減碼', emoji: '⚠️', color: 'bg-orange-500 text-white' },
    SELL:       { label: '建議賣出', emoji: '🔴', color: 'bg-red-500 text-white' },
    AVOID:      { label: '暫時避開', emoji: '🔴', color: 'bg-red-400 text-white' },
};

function ActionBadge({ action }: { action: string }) {
    const config = ACTION_CONFIG[action] || { label: action, emoji: '❓', color: 'bg-gray-500 text-white' };
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${config.color}`}>
            {config.emoji} {config.label}
        </span>
    );
}

function StockCard({ rec }: { rec: Recommendation }) {
    return (
        <div className="border rounded-lg p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
                <div>
                    <span className="font-semibold">{rec.name}</span>
                    <span className="text-muted-foreground text-xs ml-2">({rec.symbol})</span>
                </div>
                <ActionBadge action={rec.action} />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium">${rec.price.toFixed(2)}</span>
                <Badge variant="outline" className="text-xs">{rec.trend}</Badge>
                {rec.rsi != null && <span>RSI {rec.rsi.toFixed(1)}</span>}
            </div>
            {rec.reason && (
                <p className="text-xs text-muted-foreground border-t pt-2">{rec.reason}</p>
            )}
        </div>
    );
}

export function DailyRecommendation() {
    const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
    const [report, setReport] = useState<DailyReport | null>(null);
    const [availableDates, setAvailableDates] = useState<string[]>([]);
    const [currentDate, setCurrentDate] = useState('');
    const [loading, setLoading] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState('');
    const [showFullReport, setShowFullReport] = useState(false);

    const fetchRecommendations = useCallback(async (date?: string) => {
        setLoading(true);
        setError('');
        try {
            const url = date ? `/api/daily-recommendation?date=${date}` : '/api/daily-recommendation';
            const res = await fetch(url);
            if (!res.ok) throw new Error('無法取得推薦資料');
            const data = await res.json();
            setRecommendations(data.recommendations || []);
            setReport(data.report || null);
            setAvailableDates(data.availableDates || []);
            setCurrentDate(data.date);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchRecommendations(); }, [fetchRecommendations]);

    const generateNow = async () => {
        setGenerating(true);
        setError('');
        try {
            const res = await fetch('/api/cron/daily-recommendation');
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '生成失敗');
            await fetchRecommendations();
        } catch (e: any) {
            setError(e.message);
        } finally {
            setGenerating(false);
        }
    };

    const navigateDate = (direction: 'prev' | 'next') => {
        const idx = availableDates.findIndex(d =>
            new Date(d).toDateString() === new Date(currentDate).toDateString()
        );
        if (direction === 'prev' && idx < availableDates.length - 1) fetchRecommendations(availableDates[idx + 1]);
        if (direction === 'next' && idx > 0) fetchRecommendations(availableDates[idx - 1]);
    };

    const holdings = recommendations.filter(r => r.isHolding);
    const watchlist = recommendations.filter(r => !r.isHolding);

    const formatDate = (dateStr: string) =>
        new Date(dateStr).toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });

    return (
        <div className="space-y-4">
            {/* Header */}
            <Card>
                <CardHeader>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <CardTitle className="flex items-center gap-2">
                            <Zap className="h-5 w-5 text-yellow-500" />
                            每日 AI 操作建議
                        </CardTitle>
                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" onClick={() => navigateDate('prev')}
                                disabled={loading || availableDates.length <= 1}>
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <span className="text-sm font-medium min-w-[180px] text-center">
                                {currentDate ? formatDate(currentDate) : '---'}
                            </span>
                            <Button variant="outline" size="sm" onClick={() => navigateDate('next')}
                                disabled={loading || availableDates.length <= 1}>
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                            <Button onClick={generateNow} disabled={generating} size="sm">
                                <RefreshCw className={`h-4 w-4 mr-2 ${generating ? 'animate-spin' : ''}`} />
                                {generating ? '分析中...' : '立即生成今日建議'}
                            </Button>
                        </div>
                    </div>
                </CardHeader>
            </Card>

            {error && (
                <Card className="border-red-200">
                    <CardContent className="pt-4">
                        <p className="text-red-500 text-sm">{error}</p>
                    </CardContent>
                </Card>
            )}

            {loading ? (
                <Card>
                    <CardContent className="flex justify-center items-center py-12">
                        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground mr-2" />
                        <span className="text-muted-foreground">載入中...</span>
                    </CardContent>
                </Card>
            ) : recommendations.length === 0 ? (
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12 space-y-4">
                        <Zap className="h-12 w-12 text-muted-foreground/30" />
                        <p className="text-muted-foreground text-center">
                            今日尚未生成推薦。<br />
                            點擊「立即生成今日建議」開始分析你的持股與觀察清單！
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <>
                    {/* Summary & Spotlight */}
                    {report && (
                        <div className="grid gap-4 md:grid-cols-2">
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-sm font-medium text-muted-foreground">今日盤勢觀察</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-sm">{report.summary}</p>
                                </CardContent>
                            </Card>

                            {report.spotlight.length > 0 && (
                                <Card>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                            <Star className="h-4 w-4 text-yellow-500" />
                                            今日重點關注
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-2">
                                            {report.spotlight.map((s, i) => (
                                                <div key={i} className="flex items-start gap-2 text-sm">
                                                    <span className="font-semibold shrink-0">⚡ {s.symbol}</span>
                                                    <span className="text-muted-foreground">{s.reason}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </CardContent>
                                </Card>
                            )}
                        </div>
                    )}

                    {/* Per-stock cards */}
                    <div className="grid gap-4 md:grid-cols-2">
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <TrendingUp className="h-5 w-5 text-blue-500" />
                                    持有中 ({holdings.length})
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                {holdings.length === 0 ? (
                                    <p className="text-muted-foreground text-sm text-center py-4">目前沒有持有的股票</p>
                                ) : (
                                    <div className="space-y-3">
                                        {holdings.map(rec => <StockCard key={rec.id} rec={rec} />)}
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <Eye className="h-5 w-5 text-yellow-500" />
                                    觀察中 ({watchlist.length})
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                {watchlist.length === 0 ? (
                                    <p className="text-muted-foreground text-sm text-center py-4">目前沒有觀察中的股票</p>
                                ) : (
                                    <div className="space-y-3">
                                        {watchlist.map(rec => <StockCard key={rec.id} rec={rec} />)}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    {/* Full report toggle */}
                    {report?.fullReport && (
                        <Card>
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <CardTitle className="flex items-center gap-2 text-base">
                                        <FileText className="h-5 w-5 text-muted-foreground" />
                                        完整 AI 分析報告
                                    </CardTitle>
                                    <Button variant="outline" size="sm" onClick={() => setShowFullReport(p => !p)}>
                                        {showFullReport ? '收起' : '展開'}
                                    </Button>
                                </div>
                            </CardHeader>
                            {showFullReport && (
                                <CardContent>
                                    <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-sm">
                                        {report.fullReport}
                                    </div>
                                </CardContent>
                            )}
                        </Card>
                    )}

                    {/* Summary stats */}
                    <Card>
                        <CardContent className="pt-4">
                            <div className="flex flex-wrap gap-3 justify-center">
                                {Object.entries(ACTION_CONFIG).map(([key, config]) => {
                                    const count = recommendations.filter(r => r.action === key).length;
                                    if (count === 0) return null;
                                    return (
                                        <div key={key} className="flex items-center gap-1 text-sm">
                                            <span>{config.emoji}</span>
                                            <span className="font-medium">{config.label}</span>
                                            <Badge variant="secondary">{count}</Badge>
                                        </div>
                                    );
                                })}
                            </div>
                        </CardContent>
                    </Card>
                </>
            )}
        </div>
    );
}
