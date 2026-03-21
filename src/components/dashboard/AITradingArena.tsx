'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Trophy, TrendingUp, TrendingDown, Minus, Settings,
    RefreshCw, Zap, BarChart3, Clock, Target, Shield, X, Plus, Trash2
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AITradingRec {
    id: number;
    date: string;
    aiModel: string;
    symbol: string;
    name: string;
    action: 'BUY' | 'SELL' | 'HOLD';
    confidence: number;
    targetPrice: number | null;
    stopLoss: number | null;
    entryPrice: number;
    reason: string;
    exitPrice: number | null;
    returnPct: number | null;
    isWin: boolean | null;
    closedAt: string | null;
}

interface LeaderboardEntry {
    total: number;
    wins: number;
    totalReturn: number;
}

interface Config {
    claude_enabled: boolean;
    openai_enabled: boolean;
    gemini_enabled: boolean;
    stocks: string[];
    min_confidence: number;
    close_days: number;
    auto_paper_trade: boolean;
    auto_paper_min_confidence: number;
}

const MODEL_LABELS: Record<string, string> = {
    claude: '🟠 Claude',
    openai: '🟢 GPT-4o',
    gemini: '🔵 Gemini',
};

const MODEL_COLORS: Record<string, string> = {
    claude: 'border-orange-500 bg-orange-950/20',
    openai: 'border-green-500 bg-green-950/20',
    gemini: 'border-blue-500 bg-blue-950/20',
};

const ACTION_BADGE: Record<string, string> = {
    BUY: 'bg-green-600 text-white',
    SELL: 'bg-red-600 text-white',
    HOLD: 'bg-yellow-600 text-white',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function WinRate({ total, wins }: { total: number; wins: number }) {
    if (total === 0) return <span className="text-muted-foreground text-xs">無紀錄</span>;
    const pct = ((wins / total) * 100).toFixed(0);
    const color = Number(pct) >= 55 ? 'text-green-400' : Number(pct) >= 45 ? 'text-yellow-400' : 'text-red-400';
    return <span className={`font-bold ${color}`}>{pct}%</span>;
}

function ReturnBadge({ value }: { value: number | null }) {
    if (value == null) return <span className="text-muted-foreground text-xs">未結算</span>;
    const color = value > 0 ? 'text-green-400' : value < 0 ? 'text-red-400' : 'text-muted-foreground';
    const sign = value > 0 ? '+' : '';
    return <span className={`font-mono text-sm font-bold ${color}`}>{sign}{value.toFixed(2)}%</span>;
}

function ConfidenceBar({ value }: { value: number }) {
    const color = value >= 75 ? 'bg-green-500' : value >= 55 ? 'bg-yellow-500' : 'bg-red-500';
    return (
        <div className="flex items-center gap-1.5">
            <div className="flex-1 bg-muted rounded-full h-1.5">
                <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${value}%` }} />
            </div>
            <span className="text-xs text-muted-foreground w-7 text-right">{value}%</span>
        </div>
    );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function RecCard({ rec }: { rec: AITradingRec }) {
    const isClosed = rec.closedAt != null;
    return (
        <div className="border border-border rounded-lg p-3 space-y-2 hover:border-muted-foreground/40 transition-colors">
            <div className="flex items-start justify-between gap-2">
                <div>
                    <div className="font-semibold text-sm">{rec.name}</div>
                    <div className="text-xs text-muted-foreground">{rec.symbol}</div>
                </div>
                <div className="flex flex-col items-end gap-1">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${ACTION_BADGE[rec.action]}`}>
                        {rec.action}
                    </span>
                    {isClosed && <ReturnBadge value={rec.returnPct} />}
                </div>
            </div>
            <ConfidenceBar value={rec.confidence} />
            <div className="text-xs text-muted-foreground leading-relaxed">{rec.reason}</div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>進場 <span className="font-mono text-foreground">{rec.entryPrice}</span></span>
                {rec.targetPrice && <span className="flex items-center gap-0.5"><Target className="w-3 h-3" />{rec.targetPrice}</span>}
                {rec.stopLoss && <span className="flex items-center gap-0.5 text-red-400"><Shield className="w-3 h-3" />{rec.stopLoss}</span>}
                {isClosed && rec.exitPrice && <span>出場 <span className="font-mono">{rec.exitPrice}</span></span>}
            </div>
        </div>
    );
}

function LeaderboardCard({ model, data }: { model: string; data: LeaderboardEntry }) {
    const avgReturn = data.total > 0 ? data.totalReturn / data.total : 0;
    return (
        <Card className={`border-2 ${MODEL_COLORS[model]}`}>
            <CardContent className="p-4 space-y-3">
                <div className="text-lg font-bold">{MODEL_LABELS[model] || model}</div>
                <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                        <div className="text-xs text-muted-foreground">勝率</div>
                        <WinRate total={data.total} wins={data.wins} />
                    </div>
                    <div>
                        <div className="text-xs text-muted-foreground">平均報酬</div>
                        <ReturnBadge value={data.total > 0 ? avgReturn : null} />
                    </div>
                    <div>
                        <div className="text-xs text-muted-foreground">筆數</div>
                        <span className="font-bold text-sm">{data.total}</span>
                    </div>
                </div>
                <div className="text-xs text-muted-foreground">
                    勝 {data.wins} / 敗 {data.total - data.wins}
                </div>
            </CardContent>
        </Card>
    );
}

// ─── Settings Modal ───────────────────────────────────────────────────────────

function SettingsModal({ config, onClose, onSave }: {
    config: Config;
    onClose: () => void;
    onSave: (c: Config) => void;
}) {
    const [local, setLocal] = useState<Config>({ ...config });
    const [newStock, setNewStock] = useState('');
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await fetch('/api/ai-trading/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(local),
            });
            if (res.ok) {
                const data = await res.json();
                onSave(data.config);
                onClose();
            }
        } finally {
            setSaving(false);
        }
    };

    const addStock = () => {
        const s = newStock.trim().toUpperCase();
        if (s && !local.stocks.includes(s)) {
            setLocal(prev => ({ ...prev, stocks: [...prev.stocks, s] }));
        }
        setNewStock('');
    };

    const removeStock = (s: string) => {
        setLocal(prev => ({ ...prev, stocks: prev.stocks.filter(x => x !== s) }));
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="bg-background border border-border rounded-xl w-full max-w-lg p-6 space-y-5 max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold">AI 競技場設定</h2>
                    <button onClick={onClose}><X className="w-5 h-5" /></button>
                </div>

                {/* Model enable/disable */}
                <div className="space-y-2">
                    <div className="text-sm font-semibold text-muted-foreground">啟用 AI 模型</div>
                    {(['claude', 'openai', 'gemini'] as const).map(m => (
                        <label key={m} className="flex items-center gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                className="w-4 h-4"
                                checked={local[`${m}_enabled`]}
                                onChange={e => setLocal(prev => ({ ...prev, [`${m}_enabled`]: e.target.checked }))}
                            />
                            <span>{MODEL_LABELS[m]}</span>
                        </label>
                    ))}
                </div>

                {/* Stocks */}
                <div className="space-y-2">
                    <div className="text-sm font-semibold text-muted-foreground">分析股票清單</div>
                    <div className="flex gap-2">
                        <input
                            className="flex-1 bg-muted border border-border rounded px-3 py-1.5 text-sm"
                            placeholder="輸入代號（如 2330.TW 或 NVDA）"
                            value={newStock}
                            onChange={e => setNewStock(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && addStock()}
                        />
                        <Button size="sm" onClick={addStock}><Plus className="w-4 h-4" /></Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {local.stocks.map(s => (
                            <div key={s} className="flex items-center gap-1 bg-muted px-2 py-0.5 rounded text-sm">
                                {s}
                                <button onClick={() => removeStock(s)}><X className="w-3 h-3" /></button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Confidence threshold */}
                <div className="space-y-1">
                    <label className="text-sm font-semibold text-muted-foreground">
                        最低信心閾值：<span className="text-foreground">{local.min_confidence}%</span>
                    </label>
                    <input
                        type="range" min={40} max={90} step={5}
                        value={local.min_confidence}
                        onChange={e => setLocal(prev => ({ ...prev, min_confidence: Number(e.target.value) }))}
                        className="w-full"
                    />
                </div>

                {/* Close days */}
                <div className="space-y-1">
                    <label className="text-sm font-semibold text-muted-foreground">
                        持倉天數（自動結算）：<span className="text-foreground">{local.close_days} 天</span>
                    </label>
                    <input
                        type="range" min={1} max={30} step={1}
                        value={local.close_days}
                        onChange={e => setLocal(prev => ({ ...prev, close_days: Number(e.target.value) }))}
                        className="w-full"
                    />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={onClose}>取消</Button>
                    <Button onClick={handleSave} disabled={saving}>
                        {saving ? '儲存中...' : '儲存設定'}
                    </Button>
                </div>
            </div>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AITradingArena() {
    const [recs, setRecs] = useState<AITradingRec[]>([]);
    const [leaderboard, setLeaderboard] = useState<Record<string, LeaderboardEntry>>({
        claude: { total: 0, wins: 0, totalReturn: 0 },
        openai: { total: 0, wins: 0, totalReturn: 0 },
        gemini: { total: 0, wins: 0, totalReturn: 0 },
    });
    const [history, setHistory] = useState<AITradingRec[]>([]);
    const [config, setConfig] = useState<Config | null>(null);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [tab, setTab] = useState('today');
    const [genMessage, setGenMessage] = useState('');

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [todayRes, histRes] = await Promise.all([
                fetch('/api/ai-trading'),
                fetch('/api/ai-trading?history=1'),
            ]);
            const todayData = await todayRes.json();
            const histData = await histRes.json();
            if (todayData.recs) setRecs(todayData.recs);
            if (todayData.leaderboard) setLeaderboard(todayData.leaderboard);
            if (todayData.config) setConfig(todayData.config);
            if (histData.history) setHistory(histData.history);
        } catch {
            /* ignore */
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const handleGenerate = async () => {
        setGenerating(true);
        setGenMessage('');
        try {
            const res = await fetch('/api/ai-trading', { method: 'POST' });
            const data = await res.json();
            if (data.error) {
                setGenMessage(data.error);
            } else if (data.message) {
                setGenMessage(data.message);
            } else {
                setGenMessage(`成功生成 ${data.count} 筆推薦！`);
                await loadData();
            }
        } catch {
            setGenMessage('生成失敗，請稍後再試。');
        } finally {
            setGenerating(false);
        }
    };

    // Group today's recs by model
    const byModel: Record<string, AITradingRec[]> = { claude: [], openai: [], gemini: [] };
    for (const r of recs) {
        if (!byModel[r.aiModel]) byModel[r.aiModel] = [];
        byModel[r.aiModel].push(r);
    }

    // Sort leaderboard by win rate
    const rankedModels = (['claude', 'openai', 'gemini'] as string[]).sort((a: string, b: string) => {
        const lb = leaderboard[b] ?? { total: 0, wins: 0, totalReturn: 0 };
        const la = leaderboard[a] ?? { total: 0, wins: 0, totalReturn: 0 };
        const wr_a = la.total > 0 ? la.wins / la.total : 0;
        const wr_b = lb.total > 0 ? lb.wins / lb.total : 0;
        return wr_b - wr_a;
    });

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h2 className="text-2xl font-bold flex items-center gap-2">
                        <Trophy className="w-6 h-6 text-yellow-400" />
                        AI 量化交易競技場
                    </h2>
                    <p className="text-muted-foreground text-sm mt-0.5">
                        Claude vs GPT-4o vs Gemini — 每日生成交易建議，追蹤真實績效
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setShowSettings(true)}>
                        <Settings className="w-4 h-4 mr-1" />設定
                    </Button>
                    <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
                        <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />重整
                    </Button>
                    <Button size="sm" onClick={handleGenerate} disabled={generating}>
                        <Zap className="w-4 h-4 mr-1" />
                        {generating ? '生成中...' : '今日生成'}
                    </Button>
                </div>
            </div>

            {genMessage && (
                <div className="text-sm text-center py-2 px-4 rounded-lg bg-muted border border-border text-muted-foreground">
                    {genMessage}
                </div>
            )}

            {/* Leaderboard */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {rankedModels.map((m, i) => (
                    <div key={m} className="relative">
                        {i === 0 && leaderboard[m]?.total > 0 && (
                            <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-yellow-400 text-black text-xs font-bold px-2 py-0.5 rounded-full z-10">
                                🏆 領先
                            </div>
                        )}
                        <LeaderboardCard model={m} data={leaderboard[m] ?? { total: 0, wins: 0, totalReturn: 0 }} />
                    </div>
                ))}
            </div>

            {/* Tabs */}
            <Tabs value={tab} onValueChange={setTab}>
                <TabsList>
                    <TabsTrigger value="today">
                        <BarChart3 className="w-4 h-4 mr-1" />今日建議
                    </TabsTrigger>
                    <TabsTrigger value="history">
                        <Clock className="w-4 h-4 mr-1" />歷史績效
                    </TabsTrigger>
                </TabsList>

                {/* Today's picks */}
                <TabsContent value="today" className="mt-4">
                    {loading ? (
                        <div className="text-center py-12 text-muted-foreground">載入中...</div>
                    ) : recs.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground space-y-3">
                            <BarChart3 className="w-12 h-12 mx-auto opacity-30" />
                            <p>今日尚未生成 AI 交易建議</p>
                            <Button onClick={handleGenerate} disabled={generating}>
                                <Zap className="w-4 h-4 mr-1" />立即生成
                            </Button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                            {(['claude', 'openai', 'gemini'] as const).map(m => (
                                <div key={m} className={`rounded-xl border-2 p-4 space-y-3 ${MODEL_COLORS[m]}`}>
                                    <div className="font-bold text-base">{MODEL_LABELS[m]}</div>
                                    {byModel[m].length === 0 ? (
                                        <div className="text-muted-foreground text-sm py-4 text-center">
                                            {config && !config[`${m}_enabled` as keyof Config] ? '已停用' : '無推薦'}
                                        </div>
                                    ) : (
                                        byModel[m].map(rec => <RecCard key={rec.id} rec={rec} />)
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </TabsContent>

                {/* History */}
                <TabsContent value="history" className="mt-4">
                    {history.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <Clock className="w-12 h-12 mx-auto opacity-30 mb-3" />
                            <p>尚無歷史績效紀錄（需持倉期滿後自動結算）</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-border text-muted-foreground text-xs">
                                        <th className="text-left py-2 pr-3">日期</th>
                                        <th className="text-left py-2 pr-3">AI</th>
                                        <th className="text-left py-2 pr-3">股票</th>
                                        <th className="text-left py-2 pr-3">動作</th>
                                        <th className="text-right py-2 pr-3">進場</th>
                                        <th className="text-right py-2 pr-3">出場</th>
                                        <th className="text-right py-2">報酬</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {history.map(r => (
                                        <tr key={r.id} className="border-b border-border/50 hover:bg-muted/30">
                                            <td className="py-2 pr-3 text-muted-foreground whitespace-nowrap">
                                                {new Date(r.date).toLocaleDateString('zh-TW')}
                                            </td>
                                            <td className="py-2 pr-3">{MODEL_LABELS[r.aiModel] || r.aiModel}</td>
                                            <td className="py-2 pr-3">
                                                <div className="font-medium">{r.name}</div>
                                                <div className="text-xs text-muted-foreground">{r.symbol}</div>
                                            </td>
                                            <td className="py-2 pr-3">
                                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${ACTION_BADGE[r.action]}`}>
                                                    {r.action}
                                                </span>
                                            </td>
                                            <td className="py-2 pr-3 text-right font-mono">{r.entryPrice}</td>
                                            <td className="py-2 pr-3 text-right font-mono">{r.exitPrice ?? '-'}</td>
                                            <td className="py-2 text-right">
                                                <ReturnBadge value={r.returnPct} />
                                                {r.isWin != null && (
                                                    r.isWin
                                                        ? <TrendingUp className="inline w-3.5 h-3.5 text-green-400 ml-1" />
                                                        : <TrendingDown className="inline w-3.5 h-3.5 text-red-400 ml-1" />
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </TabsContent>
            </Tabs>

            {showSettings && config && (
                <SettingsModal
                    config={config}
                    onClose={() => setShowSettings(false)}
                    onSave={(c) => { setConfig(c); }}
                />
            )}
        </div>
    );
}
