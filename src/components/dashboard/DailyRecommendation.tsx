"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, ChevronLeft, ChevronRight, Zap, TrendingUp, TrendingDown, Eye } from "lucide-react";

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

const ACTION_CONFIG: Record<string, { label: string; emoji: string; color: string }> = {
    STRONG_BUY: { label: '強力買入', emoji: '⬆️', color: 'bg-green-600 text-white' },
    BUY: { label: '建議買入', emoji: '🟢', color: 'bg-green-500 text-white' },
    HOLD: { label: '繼續持有', emoji: '✅', color: 'bg-blue-500 text-white' },
    WATCH: { label: '繼續觀察', emoji: '🟡', color: 'bg-yellow-500 text-black' },
    REDUCE: { label: '考慮減碼', emoji: '⚠️', color: 'bg-orange-500 text-white' },
    SELL: { label: '建議賣出', emoji: '🔴', color: 'bg-red-500 text-white' },
    AVOID: { label: '暫時避開', emoji: '🔴', color: 'bg-red-400 text-white' },
};

export function DailyRecommendation() {
    const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
    const [availableDates, setAvailableDates] = useState<string[]>([]);
    const [currentDate, setCurrentDate] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState('');

    const fetchRecommendations = useCallback(async (date?: string) => {
        setLoading(true);
        setError('');
        try {
            const url = date
                ? `/api/daily-recommendation?date=${date}`
                : '/api/daily-recommendation';
            const res = await fetch(url);
            if (!res.ok) throw new Error('無法取得推薦資料');
            const data = await res.json();
            setRecommendations(data.recommendations || []);
            setAvailableDates(data.availableDates || []);
            setCurrentDate(data.date);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchRecommendations();
    }, [fetchRecommendations]);

    const generateNow = async () => {
        setGenerating(true);
        setError('');
        try {
            const res = await fetch('/api/cron/daily-recommendation');
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '生成失敗');
            // Refresh after generation
            await fetchRecommendations();
        } catch (e: any) {
            setError(e.message);
        } finally {
            setGenerating(false);
        }
    };

    const navigateDate = (direction: 'prev' | 'next') => {
        const currentIdx = availableDates.findIndex(d =>
            new Date(d).toDateString() === new Date(currentDate).toDateString()
        );
        if (direction === 'prev' && currentIdx < availableDates.length - 1) {
            fetchRecommendations(availableDates[currentIdx + 1]);
        } else if (direction === 'next' && currentIdx > 0) {
            fetchRecommendations(availableDates[currentIdx - 1]);
        }
    };

    const holdings = recommendations.filter(r => r.isHolding);
    const watchlist = recommendations.filter(r => !r.isHolding);

    const getActionBadge = (action: string) => {
        const config = ACTION_CONFIG[action] || { label: action, emoji: '❓', color: 'bg-gray-500 text-white' };
        return (
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${config.color}`}>
                {config.emoji} {config.label}
            </span>
        );
    };

    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr);
        return d.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
    };

    return (
        <div className="space-y-4">
            {/* Header with controls */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2">
                            <Zap className="h-5 w-5 text-yellow-500" />
                            每日 AI 操作建議
                        </CardTitle>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => navigateDate('prev')}
                                disabled={loading || availableDates.length <= 1}
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <span className="text-sm font-medium min-w-[180px] text-center">
                                {currentDate ? formatDate(currentDate) : '---'}
                            </span>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => navigateDate('next')}
                                disabled={loading || availableDates.length <= 1}
                            >
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                            <Button
                                onClick={generateNow}
                                disabled={generating}
                                size="sm"
                            >
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
                <div className="grid gap-4 md:grid-cols-2">
                    {/* Holdings Section */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-lg">
                                <TrendingUp className="h-5 w-5 text-blue-500" />
                                持有中的股票 ({holdings.length})
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {holdings.length === 0 ? (
                                <p className="text-muted-foreground text-sm text-center py-4">目前沒有持有的股票</p>
                            ) : (
                                <div className="space-y-3">
                                    {holdings.map((rec) => (
                                        <div key={rec.id} className="border rounded-lg p-3 space-y-2">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <span className="font-semibold">{rec.name}</span>
                                                    <span className="text-muted-foreground text-sm ml-2">({rec.symbol})</span>
                                                </div>
                                                {getActionBadge(rec.action)}
                                            </div>
                                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                                <span>${rec.price.toFixed(2)}</span>
                                                <Badge variant="outline">{rec.trend}</Badge>
                                                {rec.rsi && <span>RSI: {rec.rsi.toFixed(1)}</span>}
                                            </div>
                                            {rec.reason && (
                                                <p className="text-sm text-muted-foreground border-t pt-2 mt-1">{rec.reason}</p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Watchlist Section */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-lg">
                                <Eye className="h-5 w-5 text-yellow-500" />
                                觀察中的股票 ({watchlist.length})
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {watchlist.length === 0 ? (
                                <p className="text-muted-foreground text-sm text-center py-4">目前沒有觀察中的股票</p>
                            ) : (
                                <div className="space-y-3">
                                    {watchlist.map((rec) => (
                                        <div key={rec.id} className="border rounded-lg p-3 space-y-2">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <span className="font-semibold">{rec.name}</span>
                                                    <span className="text-muted-foreground text-sm ml-2">({rec.symbol})</span>
                                                </div>
                                                {getActionBadge(rec.action)}
                                            </div>
                                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                                <span>${rec.price.toFixed(2)}</span>
                                                <Badge variant="outline">{rec.trend}</Badge>
                                                {rec.rsi && <span>RSI: {rec.rsi.toFixed(1)}</span>}
                                            </div>
                                            {rec.reason && (
                                                <p className="text-sm text-muted-foreground border-t pt-2 mt-1">{rec.reason}</p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Summary stats */}
            {recommendations.length > 0 && (
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
            )}
        </div>
    );
}
