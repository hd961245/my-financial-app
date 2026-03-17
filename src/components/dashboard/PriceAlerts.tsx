"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Bell, BellOff, Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";

interface PriceAlert {
    id: number;
    symbol: string;
    name: string;
    targetPrice: number;
    condition: 'ABOVE' | 'BELOW';
    isActive: boolean;
    triggeredAt: string | null;
    createdAt: string;
}

export function PriceAlerts() {
    const [alerts, setAlerts] = useState<PriceAlert[]>([]);
    const [loading, setLoading] = useState(false);
    const [form, setForm] = useState({ symbol: '', name: '', targetPrice: '', condition: 'ABOVE' as 'ABOVE' | 'BELOW' });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const fetchAlerts = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/price-alerts');
            if (res.ok) setAlerts(await res.json());
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchAlerts(); }, []);

    const addAlert = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.symbol || !form.targetPrice) return;
        setSubmitting(true);
        setError('');
        try {
            const res = await fetch('/api/price-alerts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setAlerts(prev => [data, ...prev]);
            setForm({ symbol: '', name: '', targetPrice: '', condition: 'ABOVE' });
        } catch (e: any) {
            setError(e.message);
        } finally {
            setSubmitting(false);
        }
    };

    const deleteAlert = async (id: number) => {
        await fetch(`/api/price-alerts?id=${id}`, { method: 'DELETE' });
        setAlerts(prev => prev.filter(a => a.id !== id));
    };

    const toggleAlert = async (id: number, isActive: boolean) => {
        const res = await fetch('/api/price-alerts', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, isActive }),
        });
        if (res.ok) {
            const updated = await res.json();
            setAlerts(prev => prev.map(a => a.id === id ? updated : a));
        }
    };

    const activeAlerts = alerts.filter(a => a.isActive);
    const triggeredAlerts = alerts.filter(a => !a.isActive && a.triggeredAt);
    const pausedAlerts = alerts.filter(a => !a.isActive && !a.triggeredAt);

    return (
        <div className="space-y-4">
            {/* Add form */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Bell className="h-5 w-5 text-yellow-500" />
                        新增到價提醒
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={addAlert} className="flex flex-wrap gap-2">
                        <Input
                            placeholder="股票代號 (e.g. AAPL)"
                            className="w-36"
                            value={form.symbol}
                            onChange={e => setForm(p => ({ ...p, symbol: e.target.value.toUpperCase() }))}
                        />
                        <Input
                            placeholder="名稱 (選填)"
                            className="w-36"
                            value={form.name}
                            onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                        />
                        <select
                            className="border rounded-md px-3 py-2 text-sm bg-background"
                            value={form.condition}
                            onChange={e => setForm(p => ({ ...p, condition: e.target.value as 'ABOVE' | 'BELOW' }))}
                        >
                            <option value="ABOVE">突破 ↑</option>
                            <option value="BELOW">跌破 ↓</option>
                        </select>
                        <Input
                            type="number"
                            placeholder="目標價格"
                            className="w-36"
                            step="0.01"
                            value={form.targetPrice}
                            onChange={e => setForm(p => ({ ...p, targetPrice: e.target.value }))}
                        />
                        <Button type="submit" disabled={submitting}>
                            <Plus className="h-4 w-4 mr-1" />
                            新增
                        </Button>
                    </form>
                    {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
                </CardContent>
            </Card>

            {/* Active alerts */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">
                        監控中 <Badge variant="secondary">{activeAlerts.length}</Badge>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <p className="text-muted-foreground text-sm text-center py-4">載入中...</p>
                    ) : activeAlerts.length === 0 ? (
                        <p className="text-muted-foreground text-sm text-center py-4">目前沒有監控中的提醒</p>
                    ) : (
                        <div className="space-y-2">
                            {activeAlerts.map(alert => (
                                <AlertRow key={alert.id} alert={alert} onDelete={deleteAlert} onToggle={toggleAlert} />
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Triggered alerts */}
            {triggeredAlerts.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base text-green-600">
                            已觸發 <Badge className="bg-green-100 text-green-700">{triggeredAlerts.length}</Badge>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            {triggeredAlerts.map(alert => (
                                <AlertRow key={alert.id} alert={alert} onDelete={deleteAlert} onToggle={toggleAlert} />
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Paused alerts */}
            {pausedAlerts.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base text-muted-foreground">
                            已暫停 <Badge variant="outline">{pausedAlerts.length}</Badge>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            {pausedAlerts.map(alert => (
                                <AlertRow key={alert.id} alert={alert} onDelete={deleteAlert} onToggle={toggleAlert} />
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

function AlertRow({
    alert,
    onDelete,
    onToggle,
}: {
    alert: PriceAlert;
    onDelete: (id: number) => void;
    onToggle: (id: number, isActive: boolean) => void;
}) {
    return (
        <div className={`flex items-center justify-between p-3 rounded-lg border ${!alert.isActive ? 'opacity-60' : ''}`}>
            <div className="flex items-center gap-3">
                <div className={`p-1 rounded-full ${alert.condition === 'ABOVE' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                    {alert.condition === 'ABOVE'
                        ? <ArrowUp className="h-3 w-3" />
                        : <ArrowDown className="h-3 w-3" />
                    }
                </div>
                <div>
                    <span className="font-semibold text-sm">{alert.name}</span>
                    <span className="text-muted-foreground text-xs ml-2">({alert.symbol})</span>
                    <div className="text-xs text-muted-foreground">
                        {alert.condition === 'ABOVE' ? '突破' : '跌破'}{' '}
                        <span className="font-medium text-foreground">${alert.targetPrice.toFixed(2)}</span>
                        {alert.triggeredAt && (
                            <span className="ml-2 text-green-600">
                                ✅ 已觸發 {new Date(alert.triggeredAt).toLocaleDateString('zh-TW')}
                            </span>
                        )}
                    </div>
                </div>
            </div>
            <div className="flex items-center gap-1">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onToggle(alert.id, !alert.isActive)}
                    title={alert.isActive ? '暫停' : '啟用'}
                >
                    {alert.isActive ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => onDelete(alert.id)} className="text-red-500 hover:text-red-700">
                    <Trash2 className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );
}
