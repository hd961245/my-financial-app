"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCcw, Trash2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";

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
    const [trades, setTrades] = useState<TradeItem[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [realizedPnL, setRealizedPnL] = useState<number>(0);
    const [quotes, setQuotes] = useState<Record<string, QuoteData>>({});
    const [loading, setLoading] = useState(true);

    // Form states
    const [symbol, setSymbol] = useState("");
    const [tradeType, setTradeType] = useState("BUY");
    const [shares, setShares] = useState("");
    const [price, setPrice] = useState("");
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [categoryId, setCategoryId] = useState<string>("none"); // 'none' means unassigned

    const [newCategoryName, setNewCategoryName] = useState("");

    const fetchCategories = async () => {
        try {
            const res = await fetch("/api/categories");
            if (res.ok) setCategories(await res.json());
        } catch (error) {
            console.error(error);
        }
    };

    const fetchPortfolio = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/portfolio");
            const data = await res.json();
            setGroupedHoldings(data.holdings || {});
            setFlatHoldings(data.flatHoldings || []);
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
        fetchCategories();
        fetchPortfolio();

        const interval = setInterval(fetchPortfolio, 10000);
        return () => clearInterval(interval);
    }, []);

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

    return (
        <div className="space-y-4">
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
        </div>
    );
}
