"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCcw, Search, TrendingUp, TrendingDown, Activity } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

type SheetItem = Record<string, string | number>;

type AnalysisData = {
    symbol: string;
    name: string;
    price: number;
    changePercent: number;
    technical: {
        trend: string;
        sma20: number | null;
        sma60: number | null;
        rsi: number | null;
        macd: { MACD?: number, histogram?: number, signal?: number } | null;
    };
    news: { title: string; link: string; publisher: string; time: string }[];
};

export function GoogleSheetsTracker() {
    const [sheetId, setSheetId] = useState("");
    const [savedSheetId, setSavedSheetId] = useState("");
    const [data, setData] = useState<SheetItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    // Analysis State
    const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
    const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
    const [analyzing, setAnalyzing] = useState(false);
    const [analysisError, setAnalysisError] = useState("");

    // Load saved Sheet ID from localStorage on mount
    useEffect(() => {
        const storedId = localStorage.getItem("googleSheetId");
        if (storedId) {
            setSheetId(storedId);
            setSavedSheetId(storedId);
        }
    }, []);

    // Fetch data when we have a saved ID
    useEffect(() => {
        if (!savedSheetId) return;

        const fetchData = async () => {
            setLoading(true);
            setError("");
            try {
                const res = await fetch(`/api/google-sheets?sheetId=${savedSheetId}`);
                if (!res.ok) {
                    const errorData = await res.json();
                    throw new Error(errorData.error || "Failed to fetch data");
                }
                const result = await res.json();
                setData(result);
            } catch (err: any) {
                setError(err.message);
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        fetchData();

        // Setup polling every 1 minute
        const intervalId = setInterval(fetchData, 60000);
        return () => clearInterval(intervalId);
    }, [savedSheetId]);

    const handleSaveAndFetch = () => {
        if (!sheetId.trim()) return;

        // Extract ID if user pasted full URL
        let finalId = sheetId.trim();
        if (finalId.includes("/d/")) {
            const match = finalId.match(/\/d\/(e\/[a-zA-Z0-9-_]+|[a-zA-Z0-9-_]+)/);
            if (match && match[1]) {
                finalId = match[1];
            }
        }

        setSheetId(finalId);
        setSavedSheetId(finalId);
        localStorage.setItem("googleSheetId", finalId);
    };

    // If we have data, we dynamically extract columns based on the keys of the first row (ignoring 'id')
    const columns = data.length > 0 ? Object.keys(data[0]).filter(k => k !== 'id') : [];

    // Analyze specific symbol
    const handleAnalyze = async (symbolRaw: string) => {
        if (!symbolRaw) return;
        const symbol = String(symbolRaw).trim();
        setSelectedSymbol(symbol);
        setAnalysisData(null);
        setAnalysisError("");
        setAnalyzing(true);

        try {
            const res = await fetch(`/api/analyze?symbol=${encodeURIComponent(symbol)}`);
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || "Analysis failed");
            setAnalysisData(json);
        } catch (err: any) {
            setAnalysisError(err.message);
        } finally {
            setAnalyzing(false);
        }
    };

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader>
                    <CardTitle>連結 Google 試算表 (Google Sheets Link)</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex space-x-2">
                        <Input
                            placeholder="貼上你的 Google 試算表 ID 或完整網址"
                            value={sheetId}
                            onChange={(e) => setSheetId(e.target.value)}
                            className="flex-1"
                        />
                        <Button onClick={handleSaveAndFetch} disabled={loading}>
                            {loading ? <RefreshCcw className="h-4 w-4 animate-spin mr-2" /> : null}
                            載入資料
                        </Button>
                    </div>
                    <div className="text-xs text-muted-foreground mt-2 space-y-1">
                        <p className="font-semibold text-blue-600">⚠️ Google 隱私政策更新提醒：</p>
                        <ol className="list-decimal pl-4 space-y-1">
                            <li>請在你的 Google 試算表點擊左上角 <b>檔案 (File)</b> &gt; <b>共用 (Share)</b> &gt; <b>發布到網路 (Publish to web)</b>。</li>
                            <li>選擇 <b>[你的工作表名稱]</b> 與 <b>[逗號分隔值 .csv]</b>，然後點擊「發布」。</li>
                            <li>將產生的網址（含有 <code className="bg-muted px-1 rounded">/e/2PACX...</code>）貼到上方框框中。</li>
                        </ol>
                    </div>
                    {error && (
                        <div className="mt-4 p-3 bg-red-50 text-red-600 rounded-md text-sm">
                            ⚠️ 錯誤：{error}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>自選股清單 (Watchlist)</CardTitle>
                    {savedSheetId && (
                        <Button variant="outline" size="icon" onClick={() => setSavedSheetId(savedSheetId)} disabled={loading}>
                            <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        </Button>
                    )}
                </CardHeader>
                <CardContent>
                    {data.length === 0 && !loading && !error ? (
                        <div className="text-center py-10 text-muted-foreground border-2 border-dashed rounded-md">
                            尚未匯入任何資料，請在上方輸入試算表連結。
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[100px]">分析</TableHead>
                                        {columns.map(col => (
                                            <TableHead key={col}>{col}</TableHead>
                                        ))}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {data.map((row) => (
                                        <TableRow key={row.id}>
                                            <TableCell>
                                                {/* Looking for a column named '股票代號' or 'Symbol' or the first column as fallback */}
                                                {(() => {
                                                    const symbolCol = columns.find(c => c.includes('代號') || c.toLowerCase().includes('symbol')) || columns[0];
                                                    const symbolValue = row[symbolCol];
                                                    return (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className="h-8 gap-1"
                                                            onClick={() => handleAnalyze(String(symbolValue))}
                                                        >
                                                            <Search className="h-3 w-3" />
                                                            分析
                                                        </Button>
                                                    );
                                                })()}
                                            </TableCell>
                                            {columns.map(col => {
                                                const val = row[col];

                                                // Basic formatting heuristic: if it contains "損益" or "%", or "漲跌幅", style it
                                                const isPercent = col.includes('百分比') || col.includes('損益') || col.includes('漲跌幅') || col.includes('%');
                                                const isPositive = isPercent && (String(val).includes('+') || Number(String(val).replace('%', '')) > 0);
                                                const isNegative = isPercent && (String(val).includes('-') || Number(String(val).replace('%', '')) < 0);

                                                return (
                                                    <TableCell
                                                        key={`${row.id}-${col}`}
                                                        className={`
                                                            ${isPositive ? 'text-green-600 font-medium' : ''} 
                                                            ${isNegative ? 'text-red-600 font-medium' : ''}
                                                        `}
                                                    >
                                                        {val}
                                                    </TableCell>
                                                );
                                            })}
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Dialog open={!!selectedSymbol} onOpenChange={(open: boolean) => { if (!open) setSelectedSymbol(null) }}>
                <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-xl flex items-center gap-2">
                            {analysisData ? (
                                <>
                                    {analysisData.name} ({analysisData.symbol})
                                    <span className={`text-base ${analysisData.changePercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                        ${analysisData.price} ({analysisData.changePercent >= 0 ? '+' : ''}{analysisData.changePercent?.toFixed(2)}%)
                                    </span>
                                </>
                            ) : (
                                `Analyzing ${selectedSymbol}...`
                            )}
                        </DialogTitle>
                        <DialogDescription>
                            Quant Technical Analysis & Latest News
                        </DialogDescription>
                    </DialogHeader>

                    {analyzing && (
                        <div className="flex flex-col items-center justify-center py-10 space-y-4">
                            <Activity className="h-8 w-8 animate-spin text-primary" />
                            <p className="text-sm text-muted-foreground">正在計算歷史均線與技術指標...</p>
                        </div>
                    )}

                    {!analyzing && analysisError && (
                        <div className="p-4 bg-red-50 text-red-600 rounded-md border border-red-200">
                            分析失敗：{analysisError}
                        </div>
                    )}

                    {!analyzing && analysisData && (
                        <div className="grid md:grid-cols-2 gap-4 mt-4">
                            <div className="space-y-4">
                                <h3 className="font-bold border-b pb-2 flex items-center gap-2">
                                    <Activity className="h-4 w-4 text-purple-500" /> 技術指標 (Indicators)
                                </h3>

                                <Card className="p-4">
                                    <div className="text-sm text-muted-foreground mb-1">主要趨勢 (Trend)</div>
                                    <div className={`text-lg font-bold flex items-center gap-2 ${analysisData.technical.trend.includes('Bullish') || analysisData.technical.trend.includes('多頭') ? 'text-green-500' :
                                        analysisData.technical.trend.includes('Bearish') || analysisData.technical.trend.includes('空頭') ? 'text-red-500' : 'text-yellow-500'
                                        }`}>
                                        {analysisData.technical.trend.includes('Bullish') || analysisData.technical.trend.includes('多頭') ? <TrendingUp className="h-5 w-5" /> : null}
                                        {analysisData.technical.trend.includes('Bearish') || analysisData.technical.trend.includes('空頭') ? <TrendingDown className="h-5 w-5" /> : null}
                                        {analysisData.technical.trend}
                                    </div>
                                </Card>

                                <div className="grid grid-cols-2 gap-2">
                                    <Card className="p-3">
                                        <div className="text-xs text-muted-foreground">20日均線 (SMA20)</div>
                                        <div className="font-bold">{analysisData.technical.sma20 ? `$${analysisData.technical.sma20.toFixed(2)}` : 'N/A'}</div>
                                    </Card>
                                    <Card className="p-3">
                                        <div className="text-xs text-muted-foreground">60日季線 (SMA60)</div>
                                        <div className="font-bold">{analysisData.technical.sma60 ? `$${analysisData.technical.sma60.toFixed(2)}` : 'N/A'}</div>
                                    </Card>
                                </div>

                                <Card className="p-3">
                                    <div className="flex justify-between items-center mb-2">
                                        <div className="text-xs text-muted-foreground">RSI (14) - 動能指標</div>
                                        <div className={`font-bold text-sm ${(analysisData.technical.rsi || 50) > 70 ? 'text-red-500' :
                                            (analysisData.technical.rsi || 50) < 30 ? 'text-green-500' : ''
                                            }`}>
                                            {analysisData.technical.rsi ? analysisData.technical.rsi.toFixed(2) : 'N/A'}
                                        </div>
                                    </div>
                                    <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full ${(analysisData.technical.rsi || 50) > 70 ? 'bg-red-500' : (analysisData.technical.rsi || 50) < 30 ? 'bg-green-500' : 'bg-primary'}`}
                                            style={{ width: `${Math.min(Math.max(analysisData.technical.rsi || 0, 0), 100)}%` }}
                                        />
                                    </div>
                                    <div className="text-[10px] text-muted-foreground mt-1 text-right">
                                        {(analysisData.technical.rsi || 50) > 70 ? '超買 (Overbought)' : (analysisData.technical.rsi || 50) < 30 ? '超賣 (Oversold)' : '中性 (Neutral)'}
                                    </div>
                                </Card>
                            </div>

                            <div className="space-y-4">
                                <h3 className="font-bold border-b pb-2 flex items-center gap-2">
                                    <Search className="h-4 w-4 text-blue-500" /> 近期重點新聞 (Recent News)
                                </h3>
                                <div className="space-y-3">
                                    {analysisData.news && analysisData.news.length > 0 ? (
                                        analysisData.news.map((item, idx) => (
                                            <div key={idx} className="bg-muted/30 p-3 rounded-md">
                                                <a href={item.link} target="_blank" rel="noopener noreferrer" className="text-sm font-medium hover:underline hover:text-blue-600 line-clamp-2">
                                                    {item.title}
                                                </a>
                                                <div className="text-xs text-muted-foreground mt-1 flex justify-between">
                                                    <span>{item.publisher}</span>
                                                    <span>{item.time}</span>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-md">無近期新聞</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
