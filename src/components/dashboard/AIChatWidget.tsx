"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bot, Send, Loader2 } from "lucide-react";

export function AIChatWidget() {
    const [symbol, setSymbol] = useState("");
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleAnalyze = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!symbol.trim()) return;

        setLoading(true);
        setError(null);
        setResult(null);

        try {
            const res = await fetch("/api/ai-chat", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ symbol: symbol.trim() }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "分析失敗");
            }

            setResult(data.result);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card className="h-full border-blue-200 shadow-sm bg-blue-50/50 dark:bg-blue-950/10 dark:border-blue-900">
            <CardHeader className="pb-2">
                <CardTitle className="text-blue-700 dark:text-blue-400 flex items-center gap-2">
                    <Bot className="w-5 h-5" />
                    投資小老師 (AI 助理)
                </CardTitle>
                <CardDescription>
                    輸入股票代號或名稱，我來幫你快速抓重點並用白話文解釋。
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleAnalyze} className="flex gap-2 mb-4">
                    <Input
                        placeholder="例如: 2330, 台積電, AAPL..."
                        value={symbol}
                        onChange={(e) => setSymbol(e.target.value)}
                        disabled={loading}
                        className="bg-white dark:bg-zinc-950"
                    />
                    <Button type="submit" disabled={loading || !symbol.trim()} className="shrink-0 bg-blue-600 hover:bg-blue-700">
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </Button>
                </form>

                {error && (
                    <div className="p-3 bg-red-100 text-red-700 rounded-md text-sm mb-4">
                        ⚠️ {error}
                    </div>
                )}

                {result && (
                    <div className="p-4 bg-white dark:bg-zinc-900 rounded-md border border-blue-100 dark:border-zinc-800 shadow-inner">
                        <div className="prose prose-sm dark:prose-invert max-w-none space-y-2 whitespace-pre-wrap leading-relaxed">
                            {result}
                        </div>
                    </div>
                )}

                {!result && !loading && !error && (
                    <div className="h-24 flex items-center justify-center text-sm text-blue-400 dark:text-blue-700 border-2 border-dashed border-blue-200 dark:border-blue-900/50 rounded-md">
                        等待分析指令...
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
