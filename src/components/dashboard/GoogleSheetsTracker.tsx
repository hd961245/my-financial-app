"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCcw, Search, TrendingUp, TrendingDown, Activity, Bot, Plus } from "lucide-react";
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

    // Weekly Report State
    const [reportModalOpen, setReportModalOpen] = useState(false);
    const [generatingReport, setGeneratingReport] = useState(false);
    const [weeklyReport, setWeeklyReport] = useState("");
    const [reportError, setReportError] = useState("");

    // Add Trade State
    const [addTradeOpen, setAddTradeOpen] = useState(false);
    const [tradeSymbol, setTradeSymbol] = useState("");
    const [tradeAction, setTradeAction] = useState("WATCH"); // "WATCH" or "BUY"
    const [tradeShares, setTradeShares] = useState("");
    const [tradePrice, setTradePrice] = useState("");
    const [isSubmittingTrade, setIsSubmittingTrade] = useState(false);

    // Load saved Sheet ID from database on mount
    useEffect(() => {
        const fetchInitialSetting = async () => {
            try {
                const res = await fetch("/api/settings?key=GOOGLE_SHEET_ID");
                if (res.ok) {
                    const data = await res.json();
                    if (data.value) {
                        setSheetId(data.value);
                        setSavedSheetId(data.value);
                    }
                }
            } catch (err) {
                console.error("Failed to load global sheet ID:", err);
            }
        };
        fetchInitialSetting();
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

    const handleSaveAndFetch = async () => {
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

        // Save globally to database
        try {
            await fetch("/api/google-sheets", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sheetId: finalId })
            });
            // Update saved state to trigger data fetch
            setSavedSheetId(finalId);
        } catch (err) {
            console.error("Failed to save Sheet ID:", err);
        }
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

    // Generate Weekly AI Report
    const handleGenerateReport = async () => {
        setReportModalOpen(true);
        setGeneratingReport(true);
        setWeeklyReport("");
        setReportError("");

        try {
            const res = await fetch("/api/cron/weekly-report");
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || "生成失敗");
            setWeeklyReport(json.summaryReport);
        } catch (err: any) {
            setReportError(err.message);
        } finally {
            setGeneratingReport(false);
        }
    };

    const handleOpenAddTrade = (symbolRaw: string) => {
        setTradeSymbol(String(symbolRaw).trim());
        setTradeAction("WATCH");
        setTradeShares("");
        setTradePrice("");
        setAddTradeOpen(true);
    };

    const handleSubmitTrade = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmittingTrade(true);
        try {
            const actualShares = tradeAction === "WATCH" ? 0 : Number(tradeShares);
            const actualPrice = tradeAction === "WATCH" ? 0 : Number(tradePrice);
            const date = new Date().toISOString().split('T')[0];

            const res = await fetch("/api/portfolio", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    symbol: tradeSymbol,
                    type: "BUY", // Always register as a BUY action conceptually for adding logic
                    shares: actualShares,
                    price: actualPrice,
                    date,
                    categoryId: null
                }),
            });

            if (res.ok) {
                setAddTradeOpen(false);
                alert(`${tradeSymbol} 已成功加入投資組合！`);
            } else {
                const json = await res.json();
                alert(json.error || "新增失敗");
            }
        } catch (err) {
            alert("新增失敗，網路錯誤");
        } finally {
            setIsSubmittingTrade(false);
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
                        <div className="flex gap-2">
                            <Button variant="default" className="bg-purple-600 hover:bg-purple-700 text-white" onClick={handleGenerateReport}>
                                <Bot className="h-4 w-4 mr-2" />
                                產生每週 AI 健檢報告
                            </Button>
                            <Button variant="outline" size="icon" onClick={() => setSavedSheetId(savedSheetId)} disabled={loading}>
                                <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                            </Button>
                        </div>
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
                                                        <div className="flex gap-1">
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                className="h-8 gap-1"
                                                                onClick={() => handleAnalyze(String(symbolValue))}
                                                            >
                                                                <Search className="h-3 w-3" />
                                                                分析
                                                            </Button>
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                className="h-8 gap-1 text-blue-600 hover:text-blue-700"
                                                                onClick={() => handleOpenAddTrade(String(symbolValue))}
                                                                title="加入投資組合表單"
                                                            >
                                                                <Plus className="h-3 w-3" />
                                                                加入
                                                            </Button>
                                                        </div>
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

            {/* AI Weekly Report Modal */}
            <Dialog open={reportModalOpen} onOpenChange={setReportModalOpen}>
                <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-2xl flex items-center gap-2 text-purple-700">
                            <Bot className="h-6 w-6" />
                            自選股每週 AI 健檢報告 (BETA)
                        </DialogTitle>
                        <DialogDescription>
                            AI 已經掃描了你的試算表持股，並運用量化技術指標與最新新聞為您生成這份總結報告。
                        </DialogDescription>
                    </DialogHeader>

                    {generatingReport ? (
                        <div className="flex flex-col items-center justify-center py-20 space-y-4">
                            <Activity className="h-10 w-10 animate-spin text-purple-600" />
                            <p className="text-lg text-muted-foreground animate-pulse">正在為您統整每週財務報告，請稍候...</p>
                        </div>
                    ) : reportError ? (
                        <div className="p-4 bg-red-50 text-red-600 rounded-md border border-red-200">
                            ⚠️ 錯誤：{reportError}
                        </div>
                    ) : (
                        <div className="p-6 bg-slate-50 rounded-lg border border-slate-200 shadow-inner">
                            <div className="prose prose-slate max-w-none text-sm md:text-base leading-relaxed whitespace-pre-wrap">
                                {weeklyReport}
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Quick Add Trade Modal */}
            <Dialog open={addTradeOpen} onOpenChange={setAddTradeOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>加入投資組合作業</DialogTitle>
                        <DialogDescription>
                            將 <b>{tradeSymbol}</b> 新增至您的個股表單內。
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleSubmitTrade} className="space-y-4 py-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">動作類型</label>
                            <div className="flex gap-4">
                                <label className="flex items-center gap-2">
                                    <input
                                        type="radio"
                                        name="tradeAction"
                                        value="WATCH"
                                        checked={tradeAction === "WATCH"}
                                        onChange={() => setTradeAction("WATCH")}
                                    />
                                    純加入觀察 (0 股)
                                </label>
                                <label className="flex items-center gap-2">
                                    <input
                                        type="radio"
                                        name="tradeAction"
                                        value="BUY"
                                        checked={tradeAction === "BUY"}
                                        onChange={() => setTradeAction("BUY")}
                                    />
                                    實際買入記錄
                                </label>
                            </div>
                        </div>

                        {tradeAction === "BUY" && (
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">買入股數 (Shares)</label>
                                    <Input
                                        type="number"
                                        placeholder="例如: 100"
                                        value={tradeShares}
                                        onChange={(e) => setTradeShares(e.target.value)}
                                        min="0.01"
                                        step="0.01"
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">成交單價 (Price)</label>
                                    <Input
                                        type="number"
                                        placeholder="例如: 150.5"
                                        value={tradePrice}
                                        onChange={(e) => setTradePrice(e.target.value)}
                                        min="0"
                                        step="0.0001"
                                        required
                                    />
                                </div>
                            </div>
                        )}

                        <div className="flex justify-end gap-2 pt-4">
                            <Button variant="outline" type="button" onClick={() => setAddTradeOpen(false)}>取消</Button>
                            <Button type="submit" disabled={isSubmittingTrade}>
                                {isSubmittingTrade ? "處理中..." : "確認加入"}
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
