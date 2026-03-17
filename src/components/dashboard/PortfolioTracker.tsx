"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCcw, Trash2, Wallet, Bot, Activity, RefreshCw, LineChart } from "lucide-react";
import { LineChart as RechartsLineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StockChart } from "./StockChart";
import { format } from "date-fns";
import * as xlsx from "xlsx";

type HoldingItem = {
    id: number;
    symbol: string;
    categoryId: string | null;
    categoryName: string;
    shares: number;
    price: number;
};

type TradeItem = {
    id: number;
    symbol: string;
    type: string;
    shares: number;
    price: number;
    date: string;
};

type QuoteData = {
    regularMarketPrice: number;
    regularMarketChangePercent: number;
};

type Category = {
    id: string;
    name: string;
};

export function PortfolioTracker() {
    const [groupedHoldings, setGroupedHoldings] = useState<Record<string, HoldingItem[]>>({});
    const [flatHoldings, setFlatHoldings] = useState<HoldingItem[]>([]);
    const [watchlistHoldings, setWatchlistHoldings] = useState<HoldingItem[]>([]);
    const [trades, setTrades] = useState<TradeItem[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [realizedPnL, setRealizedPnL] = useState<number>(0);
    const [quotes, setQuotes] = useState<Record<string, QuoteData>>({});
    const [loading, setLoading] = useState(true);
    const [isImporting, setIsImporting] = useState(false);

    // Account state
    const [account, setAccount] = useState<{ id: string; name: string; balance: number; totalDeposit: number; accountType: string } | null>(null);
    const [allAccounts, setAllAccounts] = useState<{ id: string; name: string; accountType: string }[]>([]);
    const [depositAmount, setDepositAmount] = useState("");
    const [isSubmittingCash, setIsSubmittingCash] = useState(false);
    const [newAccountName, setNewAccountName] = useState("");
    const [newAccountType, setNewAccountType] = useState("PAPER");
    const [isCreatingAccount, setIsCreatingAccount] = useState(false);
    const [showNewAccountForm, setShowNewAccountForm] = useState(false);

    // Form states
    const [symbol, setSymbol] = useState("");
    const [tradeType, setTradeType] = useState("BUY");
    const [shares, setShares] = useState("");
    const [price, setPrice] = useState("");
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [categoryId, setCategoryId] = useState<string>("none"); // 'none' means unassigned

    // Recommendation Modal states
    const [recommendModalOpen, setRecommendModalOpen] = useState(false);
    const [isRecommending, setIsRecommending] = useState(false);
    const [recommendData, setRecommendData] = useState<any>(null);
    const [recommendError, setRecommendError] = useState("");

    // Watchlist Report Mode
    const [watchlistReportOpen, setWatchlistReportOpen] = useState(false);
    const [isGeneratingWatchlistReport, setIsGeneratingWatchlistReport] = useState(false);
    const [watchlistReportContent, setWatchlistReportContent] = useState("");

    // Sync state
    const [isSyncingWatchlist, setIsSyncingWatchlist] = useState(false);

    // Chart Modal state
    const [chartModalOpen, setChartModalOpen] = useState(false);
    const [selectedChartSymbol, setSelectedChartSymbol] = useState("");

    // Net Worth history
    const [netWorthHistory, setNetWorthHistory] = useState<{ date: string; totalValue: number; benchmark?: number }[]>([]);
    const [showNetWorthChart, setShowNetWorthChart] = useState(false);

    const [newCategoryName, setNewCategoryName] = useState("");

    const fetchAccount = async () => {
        try {
            const res = await fetch("/api/account");
            if (res.ok) {
                const data = await res.json();
                setAccount(data.account);
                setAllAccounts(data.accounts || []);
            }
        } catch (error) { console.error(error); }
    };

    const handleCreateAccount = async () => {
        if (!newAccountName.trim()) return;
        setIsCreatingAccount(true);
        try {
            const res = await fetch("/api/account", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: 'create', name: newAccountName.trim(), accountType: newAccountType })
            });
            if (res.ok) {
                setNewAccountName("");
                setShowNewAccountForm(false);
                fetchAccount();
            }
        } catch { /* ignore */ } finally {
            setIsCreatingAccount(false);
        }
    };

    const handleSwitchAccount = (id: string) => {
        const found = allAccounts.find(a => a.id === id);
        if (found && account) {
            // Optimistically set name/type; full data will come from next fetch
            setAccount({ ...account, id: found.id, name: found.name, accountType: found.accountType });
        }
    };

    const fetchCategories = async () => {
        try {
            const res = await fetch("/api/categories");
            if (res.ok) setCategories(await res.json());
        } catch (error) {
            console.error(error);
        }
    };

    const fetchNetWorthHistory = async () => {
        try {
            const res = await fetch('/api/net-worth');
            if (!res.ok) return;
            const history: { date: string; totalValue: number }[] = await res.json();
            if (history.length < 2) { setNetWorthHistory(history); return; }

            // Fetch S&P 500 for benchmark comparison
            try {
                const startDate = history[0].date;
                const spRes = await fetch(`/api/historical?symbol=%5EGSPC&period=1y`);
                if (spRes.ok) {
                    const spData: { date: string; close: number }[] = await spRes.json();
                    // Normalize: find S&P value at portfolio start date, scale to portfolio's first value
                    const startSP = spData.find(d => d.date >= startDate)?.close;
                    const startPortfolio = history[0].totalValue;

                    if (startSP && startPortfolio > 0) {
                        const spMap = new Map(spData.map(d => [d.date, d.close]));
                        const merged = history.map(h => {
                            const sp = spMap.get(h.date);
                            return {
                                ...h,
                                benchmark: sp != null ? (sp / startSP) * startPortfolio : undefined,
                            };
                        });
                        setNetWorthHistory(merged);
                        return;
                    }
                }
            } catch { /* benchmark fetch failed, show portfolio only */ }

            setNetWorthHistory(history);
        } catch { /* ignore */ }
    };

    const saveNetWorthSnapshot = async (totalValue: number) => {
        try {
            await fetch('/api/net-worth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ totalValue }),
            });
            fetchNetWorthHistory();
        } catch { /* ignore */ }
    };

    const fetchPortfolio = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/portfolio");
            const data = await res.json();
            setGroupedHoldings(data.holdings || {});
            setFlatHoldings(data.flatHoldings || []);
            setWatchlistHoldings(data.watchlistHoldings || []);
            setTrades(data.trades || []);
            setRealizedPnL(data.realizedPnL || 0);
            setQuotes(data.quotes || {});
        } catch (error) {
            console.error("Failed to fetch portfolio:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAccount();
        fetchCategories();
        fetchPortfolio();
        fetchNetWorthHistory();

        const interval = setInterval(() => {
            fetchPortfolio();
            fetchAccount();
        }, 10000);
        return () => clearInterval(interval);
    }, []);

    const handleCashTransaction = async (action: 'deposit' | 'withdraw') => {
        if (!depositAmount || isNaN(Number(depositAmount)) || Number(depositAmount) <= 0) return;
        setIsSubmittingCash(true);
        try {
            const res = await fetch("/api/account", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action, amount: Number(depositAmount) })
            });
            const data = await res.json();
            if (res.ok) {
                setDepositAmount("");
                fetchAccount();
            } else {
                alert(data.error || "交易失敗");
            }
        } catch (err) {
            alert("網路錯誤");
        } finally {
            setIsSubmittingCash(false);
        }
    };

    const handleAddTrade = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!symbol || !shares || !price || !date) return;

        try {
            const parsedCatId = categoryId === "none" ? null : categoryId;
            const res = await fetch("/api/portfolio", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ symbol, type: tradeType, shares, price, date, categoryId: parsedCatId }),
            });
            if (res.ok) {
                setSymbol("");
                setShares("");
                setPrice("");
                fetchPortfolio();
                fetchAccount();
            } else {
                const errorData = await res.json();
                alert(errorData.error || "交易紀錄新增失敗");
            }
        } catch (error) {
            console.error("Failed to add trade:", error);
        }
    };

    const handleAddCategory = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newCategoryName) return;
        try {
            const res = await fetch("/api/categories", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: newCategoryName })
            });
            if (res.ok) {
                setNewCategoryName("");
                fetchCategories();
            }
        } catch (err) { console.error(err); }
    };

    const handleDeleteCategory = async (id: string) => {
        if (!confirm("確定刪除此分類？")) return;
        try {
            const res = await fetch(`/api/categories?id=${id}`, { method: "DELETE" });
            if (res.ok) {
                fetchCategories();
                fetchPortfolio(); // Refresh ungrouped trades
            }
        } catch (err) { console.error(err); }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsImporting(true);
        const reader = new FileReader();

        reader.onload = async (event) => {
            try {
                const data = new Uint8Array(event.target?.result as ArrayBuffer);
                const workbook = xlsx.read(data, { type: "array" });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const jsonData = xlsx.utils.sheet_to_json(worksheet);

                // Map Excel data to our expected format
                const tradesToImport = jsonData.map((row: any) => ({
                    symbol: row['股票代號'] || row['Symbol'] || '',
                    type: (row['買賣'] || row['Type'] || 'BUY').toString().toUpperCase().includes('SELL') ? 'SELL' : 'BUY',
                    shares: Number(row['股數'] || row['Shares']) || 0,
                    price: Number(row['價格'] || row['Price']) || 0,
                    date: row['日期'] || row['Date'] ? new Date(row['日期'] || row['Date']).toISOString() : new Date().toISOString(),
                    categoryId: categoryId === 'none' ? null : categoryId
                })).filter(t => t.symbol && t.shares > 0 && t.price > 0);

                if (tradesToImport.length === 0) {
                    alert('未在檔案中找到有效的交易紀錄。請確保有【股票代號, 股數, 價格】等欄位。');
                    setIsImporting(false);
                    return;
                }

                const res = await fetch("/api/portfolio", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(tradesToImport),
                });

                if (res.ok) {
                    alert(`成功匯入 ${tradesToImport.length} 筆交易！`);
                    fetchPortfolio();
                } else {
                    alert('匯入失敗，請稍後再試。');
                }
            } catch (error) {
                console.error("Error parsing file:", error);
                alert('解析檔案時發生錯誤。');
            } finally {
                setIsImporting(false);
                if (e.target) e.target.value = ''; // Reset file input
            }
        };

        reader.readAsArrayBuffer(file);
    };

    const calculateUnrealizedPnL = (item: HoldingItem) => {
        const quote = quotes[item.symbol];
        if (!quote) return { pnl: 0, percent: 0, currentVal: 0 };
        const costBasis = item.shares * item.price;
        const currentVal = item.shares * quote.regularMarketPrice;
        const pnl = currentVal - costBasis;
        const percent = costBasis !== 0 ? (pnl / Math.abs(costBasis)) * 100 : 0;
        return { pnl, percent, currentVal };
    };

    const totalUnrealizedPnL = flatHoldings.reduce((acc, item) => acc + calculateUnrealizedPnL(item).pnl, 0);
    const totalValue = flatHoldings.reduce((acc, item) => acc + calculateUnrealizedPnL(item).currentVal, 0);
    const totalProfit = totalUnrealizedPnL + realizedPnL;

    // Auto-snapshot net worth once per day when portfolio loads with data
    useEffect(() => {
        if (totalValue > 0 && !loading) {
            saveNetWorthSnapshot(totalValue + (account?.balance ?? 0));
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loading]);

    const handleRecommend = async (symbol: string, name?: string) => {
        setRecommendModalOpen(true);
        setIsRecommending(true);
        setRecommendData(null);
        setRecommendError("");

        try {
            const res = await fetch("/api/analyze/recommend", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ symbol, name })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "分析失敗");
            setRecommendData({ symbol, ...data });
        } catch (err: any) {
            setRecommendError(err.message);
        } finally {
            setIsRecommending(false);
        }
    };

    const handleGenerateWatchlistReport = async () => {
        if (watchlistHoldings.length === 0) return;
        setWatchlistReportOpen(true);
        setIsGeneratingWatchlistReport(true);
        setWatchlistReportContent("");

        try {
            const symbols = watchlistHoldings.map(h => h.symbol);
            const res = await fetch("/api/analyze/watchlist-report", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ symbols })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "分析失敗");
            setWatchlistReportContent(data.report);
        } catch (err: any) {
            setWatchlistReportContent(`⚠️ 錯誤：${err.message}`);
        } finally {
            setIsGeneratingWatchlistReport(false);
        }
    };

    const handleSyncWatchlist = async () => {
        setIsSyncingWatchlist(true);
        try {
            const res = await fetch("/api/analyze/sync-watchlist", {
                method: "POST"
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "同步失敗");
            alert(data.message || "同步成功！");
            // Refresh dashboard data
            await fetchAccount();
        } catch (err: any) {
            alert(`同步發生錯誤: ${err.message}`);
        } finally {
            setIsSyncingWatchlist(false);
        }
    };

    const handleViewChart = (symbol: string) => {
        setSelectedChartSymbol(symbol);
        setChartModalOpen(true);
    };

    return (
        <div className="space-y-4">
            {/* Account Overview */}
            <Card className="mb-4">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center justify-between">
                        <span className="flex items-center gap-2">
                            <Wallet className="h-4 w-4" />
                            {account?.name || '帳戶'}
                            {account?.accountType === 'REAL'
                                ? <span className="text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full font-normal">📊 記錄模式</span>
                                : <span className="text-xs bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 px-2 py-0.5 rounded-full font-normal">🎮 模擬模式</span>
                            }
                        </span>
                        {allAccounts.length > 1 && (
                            <select
                                value={account?.id || ''}
                                onChange={e => handleSwitchAccount(e.target.value)}
                                className="text-xs border rounded px-2 py-1 bg-background"
                            >
                                {allAccounts.map(a => (
                                    <option key={a.id} value={a.id}>{a.name} ({a.accountType === 'REAL' ? '記錄' : '模擬'})</option>
                                ))}
                            </select>
                        )}
                    </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <div className="text-3xl font-bold">${account?.balance?.toFixed(2) || '0.00'}</div>
                            <div className="text-xs text-muted-foreground mt-1">累積總入金: ${account?.totalDeposit?.toFixed(2) || '0.00'}</div>
                        </div>
                        <div className="flex items-center space-x-2 flex-wrap gap-y-2">
                            <Input type="number" placeholder="設定金額" value={depositAmount} onChange={e => setDepositAmount(e.target.value)} className="w-[120px]" />
                            <Button variant="secondary" onClick={() => handleCashTransaction('deposit')} disabled={isSubmittingCash}>入金 (Deposit)</Button>
                            <Button variant="outline" onClick={() => handleCashTransaction('withdraw')} disabled={isSubmittingCash}>提款 (Withdraw)</Button>
                            <Button variant="ghost" size="sm" onClick={() => setShowNewAccountForm(v => !v)} className="text-xs">+ 新帳戶</Button>
                        </div>
                    </div>
                    {showNewAccountForm && (
                        <div className="flex items-center gap-2 pt-2 border-t">
                            <Input placeholder="帳戶名稱" value={newAccountName} onChange={e => setNewAccountName(e.target.value)} className="w-40" />
                            <select
                                value={newAccountType}
                                onChange={e => setNewAccountType(e.target.value)}
                                className="text-sm border rounded px-2 py-1.5 bg-background"
                            >
                                <option value="PAPER">🎮 模擬帳戶</option>
                                <option value="REAL">📊 真實記錄</option>
                            </select>
                            <Button size="sm" onClick={handleCreateAccount} disabled={isCreatingAccount || !newAccountName.trim()}>建立</Button>
                            <Button size="sm" variant="ghost" onClick={() => setShowNewAccountForm(false)}>取消</Button>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Metrics */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">總資產市值 (Total Value)</CardTitle></CardHeader>
                    <CardContent><div className="text-2xl font-bold">${totalValue.toFixed(2)}</div></CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">帳面損益 (Unrealized PnL)</CardTitle></CardHeader>
                    <CardContent>
                        <div className={`text-2xl font-bold flex items-center ${totalUnrealizedPnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {totalUnrealizedPnL >= 0 ? '+' : ''}${totalUnrealizedPnL.toFixed(2)}
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">已實現損益 (Realized PnL)</CardTitle></CardHeader>
                    <CardContent>
                        <div className={`text-2xl font-bold flex items-center ${realizedPnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {realizedPnL >= 0 ? '+' : ''}${realizedPnL.toFixed(2)}
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">帳戶總獲利 (Account Profit)</CardTitle></CardHeader>
                    <CardContent>
                        <div className={`text-2xl font-bold flex items-center ${totalProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {totalProfit >= 0 ? '+' : ''}${totalProfit.toFixed(2)}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Net Worth History Chart */}
            {netWorthHistory.length > 1 && (
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center justify-between">
                            <span className="flex items-center gap-2"><LineChart className="h-4 w-4" /> 淨值歷史走勢</span>
                            <Button variant="ghost" size="sm" onClick={() => setShowNetWorthChart(v => !v)} className="text-xs">
                                {showNetWorthChart ? '收起' : '展開'}
                            </Button>
                        </CardTitle>
                    </CardHeader>
                    {showNetWorthChart && (
                        <CardContent>
                            <div className="h-48">
                                <ResponsiveContainer width="100%" height="100%">
                                    <RechartsLineChart data={netWorthHistory}>
                                        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                                        <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => d.slice(5)} interval="preserveStartEnd" />
                                        <YAxis tick={{ fontSize: 11 }} width={60} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                                        <Tooltip formatter={(v: number | undefined) => [v != null ? `$${v.toLocaleString()}` : '', '']} labelFormatter={d => `日期：${d}`} />
                                        <Legend />
                                        <Line type="monotone" dataKey="totalValue" name="我的淨值" stroke="#3b82f6" dot={false} strokeWidth={2} />
                                        <Line type="monotone" dataKey="benchmark" name="S&P 500 (同期)" stroke="#f59e0b" dot={false} strokeWidth={1.5} strokeDasharray="4 2" connectNulls />
                                    </RechartsLineChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    )}
                </Card>
            )}

            <div className="grid gap-4 md:grid-cols-[1fr_2fr]">
                {/* Left Column Forms */}
                <div className="space-y-4 h-fit">
                    {/* Category Manager */}
                    <Card>
                        <CardHeader><CardTitle>管理分類 (Manage Categories)</CardTitle></CardHeader>
                        <CardContent>
                            <form onSubmit={handleAddCategory} className="flex space-x-2 mb-4">
                                <Input placeholder="新分類名稱" value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} />
                                <Button type="submit" variant="secondary">新增</Button>
                            </form>
                            <div className="space-y-2">
                                {categories.length === 0 ? <p className="text-sm text-muted-foreground">無分類設定</p> :
                                    categories.map(cat => (
                                        <div key={cat.id} className="flex justify-between items-center bg-muted/30 p-2 rounded text-sm">
                                            <span>{cat.name}</span>
                                            <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500" onClick={() => handleDeleteCategory(cat.id)}><Trash2 className="h-3 w-3" /></Button>
                                        </div>
                                    ))
                                }
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>記錄交易 (Log Trade)</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleAddTrade} className="space-y-4 flex flex-col">
                                <div className="flex space-x-2">
                                    <Select value={tradeType} onValueChange={setTradeType}>
                                        <SelectTrigger className="w-[100px]">
                                            <SelectValue placeholder="類型" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="BUY" className="text-green-500 font-medium">買進 (Buy)</SelectItem>
                                            <SelectItem value="SELL" className="text-red-500 font-medium">賣出 (Sell)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <Input placeholder="日期 (Date)" type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full" />
                                </div>
                                <Select value={categoryId} onValueChange={setCategoryId}>
                                    <SelectTrigger className="w-full">
                                        <SelectValue placeholder="選擇投資分類" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">未分類 (Unassigned)</SelectItem>
                                        {categories.map(cat => (
                                            <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Input placeholder="股票代號 (如 AAPL, 2330.TW)" value={symbol} onChange={e => setSymbol(e.target.value)} />
                                <div className="flex space-x-2">
                                    <Input type="number" placeholder="股數 (Shares)" value={shares} onChange={e => setShares(e.target.value)} />
                                    <Input type="number" step="0.01" placeholder="價格 (Price)" value={price} onChange={e => setPrice(e.target.value)} />
                                </div>
                                <Button type="submit" className={tradeType === 'BUY' ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}>
                                    {tradeType === 'BUY' ? '新增買進紀錄' : '新增賣出紀錄'}
                                </Button>
                            </form>

                            <div className="mt-6 pt-4 border-t border-muted">
                                <h4 className="text-sm font-medium mb-3">批次匯入交易 (Batch Import)</h4>
                                <div className="flex items-center space-x-2">
                                    <Input
                                        type="file"
                                        accept=".xlsx, .xls, .csv"
                                        onChange={handleFileUpload}
                                        disabled={isImporting}
                                        className="text-xs file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                                    />
                                </div>
                                <p className="text-xs text-muted-foreground mt-2">支援 Excel 或 CSV 格式。欄位需包含：股票代號、買賣、股數、價格、日期。</p>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Right Column Holdings */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle>持倉狀態 (Current Holdings)</CardTitle>
                        <Button variant="outline" size="icon" onClick={fetchPortfolio} disabled={loading}>
                            <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        </Button>
                    </CardHeader>
                    <CardContent>
                        {Object.keys(groupedHoldings).length === 0 ? (
                            <div className="text-center py-6 text-muted-foreground">目前無任何持倉資料 (No current holdings).</div>
                        ) : (
                            <div className="space-y-6">
                                {Object.entries(groupedHoldings).map(([catName, items]) => {
                                    // Calculate subtotal for this category
                                    const catPnL = items.reduce((acc, item) => acc + calculateUnrealizedPnL(item).pnl, 0);
                                    const catVal = items.reduce((acc, item) => acc + calculateUnrealizedPnL(item).currentVal, 0);

                                    return (
                                        <div key={catName}>
                                            <div className="flex justify-between items-center mb-2 px-2 bg-muted/50 p-2 rounded-t-md">
                                                <h3 className="font-bold text-sm tracking-wide">{catName}</h3>
                                                <div className="text-xs flex gap-x-4">
                                                    <span>市值: ${catVal.toFixed(2)}</span>
                                                    <span className={catPnL >= 0 ? 'text-green-500 font-bold' : 'text-red-500 font-bold'}>
                                                        損益: {catPnL >= 0 ? '+' : ''}${catPnL.toFixed(2)}
                                                    </span>
                                                </div>
                                            </div>
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>股票代號</TableHead>
                                                        <TableHead>持有股數</TableHead>
                                                        <TableHead>平均成本</TableHead>
                                                        <TableHead>目前市價</TableHead>
                                                        <TableHead className="text-right">未實現損益</TableHead>
                                                        <TableHead className="text-right w-24">操作</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {items.map((item) => {
                                                        const { pnl, percent } = calculateUnrealizedPnL(item);
                                                        const quote = quotes[item.symbol];
                                                        return (
                                                            <TableRow key={item.symbol + catName}>
                                                                <TableCell className="font-medium">{item.symbol}</TableCell>
                                                                <TableCell>{item.shares}</TableCell>
                                                                <TableCell>${item.price.toFixed(2)}</TableCell>
                                                                <TableCell>{quote ? `$${quote.regularMarketPrice.toFixed(2)}` : '...'}</TableCell>
                                                                <TableCell className={`text-right ${pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                                                    {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} ({pnl >= 0 ? '+' : ''}{percent.toFixed(2)}%)
                                                                </TableCell>
                                                                <TableCell className="text-right">
                                                                    <Button variant="ghost" size="icon" onClick={() => handleViewChart(item.symbol)} title="看走勢圖">
                                                                        <LineChart className="h-4 w-4 text-blue-600" />
                                                                    </Button>
                                                                </TableCell>
                                                            </TableRow>
                                                        )
                                                    })}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Left/Right spanning Watchlist section (optional grid stretch later if needed) */}
                <Card className="md:col-span-2">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div className="flex items-center gap-4">
                            <CardTitle>觀察清單 (Watchlist - 0 股)</CardTitle>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleSyncWatchlist}
                                disabled={isSyncingWatchlist}
                            >
                                <RefreshCw className={`h-4 w-4 mr-2 ${isSyncingWatchlist ? 'animate-spin' : ''}`} />
                                {isSyncingWatchlist ? '同步中...' : '從 Google 試算表同步'}
                            </Button>
                        </div>
                        <Button
                            onClick={handleGenerateWatchlistReport}
                            disabled={watchlistHoldings.length === 0}
                            className="bg-purple-600 hover:bg-purple-700 text-white"
                        >
                            <Bot className="h-4 w-4 mr-2" />
                            對觀察清單進行總體健檢
                        </Button>
                    </CardHeader>
                    <CardContent>
                        {watchlistHoldings.length === 0 ? (
                            <div className="text-center py-6 text-muted-foreground">目前無任何觀察清單資料。請使用新增交易時選擇「純觀察」。</div>
                        ) : (
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>股票代號</TableHead>
                                            <TableHead>目前市價</TableHead>
                                            <TableHead>所屬分類</TableHead>
                                            <TableHead className="text-right">操作與捷徑</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {watchlistHoldings.map((item) => {
                                            const quote = quotes[item.symbol];
                                            return (
                                                <TableRow key={item.id}>
                                                    <TableCell className="font-medium">{item.symbol}</TableCell>
                                                    <TableCell>{quote ? `$${quote.regularMarketPrice.toFixed(2)}` : '...'}</TableCell>
                                                    <TableCell>{item.categoryName}</TableCell>
                                                    <TableCell className="text-right flex items-center justify-end gap-2">
                                                        <Button variant="ghost" size="icon" onClick={() => handleViewChart(item.symbol)} title="看走勢圖">
                                                            <LineChart className="h-4 w-4 text-blue-600" />
                                                        </Button>
                                                        <Button variant="outline" size="sm" onClick={() => handleRecommend(item.symbol, item.symbol)}>
                                                            <Bot className="h-4 w-4 mr-2 text-purple-600" />
                                                            分析
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            )
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Trade Ledger / History */}
            <Card>
                <CardHeader>
                    <CardTitle>交易帳本 (Trade Ledger)</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>交易日期</TableHead>
                                <TableHead>方向</TableHead>
                                <TableHead>股票代號</TableHead>
                                <TableHead>數量</TableHead>
                                <TableHead className="text-right">成交價</TableHead>
                                <TableHead className="text-right">總金額</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {trades.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No trades recorded yet. Log one above!</TableCell>
                                </TableRow>
                            ) : (
                                trades.map((trade) => (
                                    <TableRow key={trade.id}>
                                        <TableCell className="text-muted-foreground">{format(new Date(trade.date), 'MMM dd, yyyy')}</TableCell>
                                        <TableCell className={`font-bold ${trade.type === 'BUY' ? 'text-green-500' : 'text-red-500'}`}>{trade.type}</TableCell>
                                        <TableCell className="font-medium">{trade.symbol}</TableCell>
                                        <TableCell>{trade.shares}</TableCell>
                                        <TableCell className="text-right">${trade.price.toFixed(2)}</TableCell>
                                        <TableCell className="text-right">${(trade.shares * trade.price).toFixed(2)}</TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* AI Recommendation Modal */}
            {recommendModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-xl shadow-xl overflow-hidden">
                        <div className="p-4 border-b flex justify-between items-center bg-muted/30">
                            <h3 className="font-bold flex items-center gap-2 text-lg text-purple-700">
                                <Bot className="h-5 w-5" /> AI 買入評估
                            </h3>
                            <Button variant="ghost" size="icon" onClick={() => setRecommendModalOpen(false)}>✕</Button>
                        </div>
                        <div className="p-6">
                            {isRecommending ? (
                                <div className="flex flex-col items-center justify-center py-10 space-y-4">
                                    <Activity className="h-10 w-10 animate-spin text-purple-600" />
                                    <p className="text-muted-foreground animate-pulse text-sm">正在請教 AI 大師...</p>
                                </div>
                            ) : recommendError ? (
                                <div className="p-4 bg-red-50 text-red-600 rounded-md">
                                    ⚠️ {recommendError}
                                </div>
                            ) : recommendData ? (
                                <div className="space-y-4">
                                    <div className="text-xl font-bold border-b pb-2">{recommendData.symbol}</div>
                                    <div className="grid grid-cols-3 gap-2 text-center text-sm">
                                        <div className="bg-slate-100 dark:bg-slate-800 p-2 rounded">
                                            <div className="text-muted-foreground text-xs">5日線 (SMA5)</div>
                                            <div className="font-semibold">{recommendData.indicators?.sma5?.toFixed(2) || 'N/A'}</div>
                                        </div>
                                        <div className="bg-slate-100 dark:bg-slate-800 p-2 rounded">
                                            <div className="text-muted-foreground text-xs">20日線 (SMA20)</div>
                                            <div className="font-semibold">{recommendData.indicators?.sma20?.toFixed(2) || 'N/A'}</div>
                                        </div>
                                        <div className="bg-slate-100 dark:bg-slate-800 p-2 rounded">
                                            <div className="text-muted-foreground text-xs">季線 (SMA60)</div>
                                            <div className="font-semibold">{recommendData.indicators?.sma60?.toFixed(2) || 'N/A'}</div>
                                        </div>
                                    </div>
                                    <div className="p-4 bg-purple-50 dark:bg-purple-900/20 text-slate-800 dark:text-slate-100 rounded-md border border-purple-100 dark:border-purple-800 text-base leading-relaxed whitespace-pre-wrap font-medium shadow-sm">
                                        {recommendData.recommendation}
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>
            )}

            {/* Watchlist Batch Report Modal */}
            {watchlistReportOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="bg-white dark:bg-slate-900 w-full max-w-3xl max-h-[90vh] flex flex-col rounded-xl shadow-xl overflow-hidden">
                        <div className="p-4 border-b flex justify-between items-center bg-muted/30">
                            <h3 className="font-bold flex items-center gap-2 text-lg text-purple-700">
                                <Bot className="h-5 w-5" /> 觀察清單總體健檢
                            </h3>
                            <Button variant="ghost" size="icon" onClick={() => setWatchlistReportOpen(false)}>✕</Button>
                        </div>
                        <div className="p-6 overflow-y-auto">
                            {isGeneratingWatchlistReport ? (
                                <div className="flex flex-col items-center justify-center py-20 space-y-4">
                                    <Activity className="h-12 w-12 animate-spin text-purple-600" />
                                    <p className="text-muted-foreground animate-pulse text-lg">正在為您的觀察清單撰寫報告...</p>
                                </div>
                            ) : (
                                <div className="prose prose-slate max-w-none text-sm md:text-base leading-relaxed whitespace-pre-wrap text-slate-800 dark:text-slate-200">
                                    {watchlistReportContent}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Historical Chart Modal */}
            {chartModalOpen && selectedChartSymbol && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="bg-white dark:bg-slate-900 w-full max-w-4xl rounded-xl shadow-xl overflow-hidden">
                        <div className="p-4 border-b flex justify-between items-center bg-muted/30">
                            <h3 className="font-bold flex items-center gap-2 text-lg text-blue-700">
                                <LineChart className="h-5 w-5" /> 歷史走勢圖 - {selectedChartSymbol}
                            </h3>
                            <Button variant="ghost" size="icon" onClick={() => setChartModalOpen(false)}>✕</Button>
                        </div>
                        <div className="p-6">
                            <StockChart symbol={selectedChartSymbol} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

