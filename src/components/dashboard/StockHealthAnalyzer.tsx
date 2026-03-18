"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export function StockHealthAnalyzer() {
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(false);
    const [stockData, setStockData] = useState<any>(null);
    const [financialData, setFinancialData] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    const isTaiwanStock = (sym: string) => sym.endsWith('.TW') || sym.endsWith('.TWO') || /^\d{4,6}$/.test(sym);

    // Auto-refresh the currently viewed stock every 10 seconds
    useEffect(() => {
        if (!stockData || !query) return;

        const interval = setInterval(async () => {
            try {
                const res = await fetch(`/api/stock-health?symbol=${query}`);
                if (res.ok) {
                    const data = await res.json();
                    setStockData(data);
                }
            } catch (err) {
                console.error("Auto-refresh failed", err);
            }
        }, 10000);

        return () => clearInterval(interval);
    }, [stockData, query]);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!query) return;

        setLoading(true);
        setError(null);
        setStockData(null);

        try {
            const res = await fetch(`/api/stock-health?symbol=${query}`);

            if (!res.ok) {
                setError("找不到該股票代號，或無法取得報價資料。");
                setLoading(false);
                return;
            }

            const data = await res.json();
            setStockData(data);

            // Fetch Taiwan financials if applicable
            if (isTaiwanStock(query)) {
                setFinancialData(null);
                try {
                    const finRes = await fetch(`/api/financials?symbol=${query}`);
                    if (finRes.ok) setFinancialData(await finRes.json());
                } catch {
                    // Silently fail - financials are supplementary
                }
            } else {
                setFinancialData(null);
            }
        } catch (err) {
            setError("取得資料時發生錯誤，請稍後再試。");
        } finally {
            setLoading(false);
        }
    };

    const renderHealthScore = () => {
        if (!stockData || typeof stockData.changePercent !== 'number') return null;
        const change = stockData.changePercent * 100; // API may return decimal

        let score = "中性 (Neutral)";
        let color = "text-yellow-500";

        if (change > 2) { score = "強勢偏多 (Strong Bullish)"; color = "text-green-500"; }
        else if (change > 0) { score = "偏多 (Bullish)"; color = "text-green-500"; }
        else if (change < -2) { score = "弱勢偏空 (Strong Bearish)"; color = "text-red-500"; }
        else if (change < 0) { score = "偏空 (Bearish)"; color = "text-red-500"; }

        return <span className={`font-bold ${color}`}>{score}</span>;
    };

    const formatPercent = (val: any) => val ? `${(val * 100).toFixed(2)}%` : '---';
    const formatPrice = (val: any) => val ? `$${Number(val).toFixed(2)}` : '---';

    // Check moving average status
    const renderMAStatus = (price: number, ma: number | null) => {
        if (!ma || !price) return <span className="text-muted-foreground">---</span>;
        if (price >= ma) return <span className="text-green-500 font-bold text-xs ml-2">站上</span>;
        return <span className="text-red-500 font-bold text-xs ml-2">跌破</span>;
    };

    return (
        <div className="space-y-4">
            <Card>
                <CardContent className="pt-6">
                    <form onSubmit={handleSearch} className="flex space-x-2">
                        <Input
                            placeholder="請輸入股票代號 (例如: MSFT, 2330.TW)"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                        />
                        <Button type="submit" disabled={loading}>
                            {loading ? "搜尋中..." : <Search className="h-4 w-4 mr-2" />}
                            {loading ? "" : "分析"}
                        </Button>
                    </form>
                    {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
                </CardContent>
            </Card>

            {stockData && !error && (
                <>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    {/* Header Summary */}
                    <Card className="md:col-span-2 lg:col-span-4">
                        <CardHeader className="pb-2">
                            <CardTitle className="flex justify-between items-center">
                                <span>{stockData.shortName} <span className="text-muted-foreground font-normal text-sm ml-2">({stockData.symbol})</span></span>
                                {stockData.sector && <span className="bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-bold">{stockData.sector} / {stockData.industry}</span>}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-end gap-x-4">
                                <div className="text-5xl font-bold">{formatPrice(stockData.currentPrice)}</div>
                                <div className={`flex items-center text-lg font-medium mb-1 ${stockData.changePercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                    {stockData.changePercent >= 0 ? <ArrowUpRight className="h-5 w-5 mr-1" /> : <ArrowDownRight className="h-5 w-5 mr-1" />}
                                    {stockData.changePercent >= 0 ? '+' : ''}
                                    {formatPercent(stockData.changePercent)}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Technical Analysis */}
                    <Card className="lg:col-span-2">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-lg">
                                <TermTooltip
                                    term="技術指標 (Technical Analysis)"
                                    explanation="利用股價、成交量等歷史數據找出規律，預測未來走勢。常見指標包括移動平均線、RSI、MACD、布林通道等。"
                                    learnMore={[{ label: "Investopedia：技術分析入門", url: "https://www.investopedia.com/technical-analysis-4689657" }]}
                                />
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3 pt-2">
                            <div className="flex justify-between items-center border-b pb-2">
                                <span className="text-sm text-muted-foreground">動能概覽 (Momentum)</span>
                                {renderHealthScore()}
                            </div>
                            <div className="grid grid-cols-2 gap-4 mt-2">
                                <div className="flex justify-between items-center bg-muted/50 p-2 rounded">
                                    <span className="text-xs font-medium">
                                        <TermTooltip
                                            term="5MA (週線)"
                                            explanation="最近 5 日收盤價的平均值，代表短期趨勢。股價站上均線偏多；跌破均線偏空。短均線穿越長均線形成黃金交叉（買訊）或死亡交叉（賣訊）。"
                                            learnMore={[{ label: "Investopedia：Moving Average", url: "https://www.investopedia.com/terms/m/movingaverage.asp" }]}
                                        />
                                    </span>
                                    <div className="text-sm">{formatPrice(stockData.movingAverages?.MA5)} {renderMAStatus(stockData.currentPrice, stockData.movingAverages?.MA5)}</div>
                                </div>
                                <div className="flex justify-between items-center bg-muted/50 p-2 rounded">
                                    <span className="text-xs font-medium">10MA</span>
                                    <div className="text-sm">{formatPrice(stockData.movingAverages?.MA10)} {renderMAStatus(stockData.currentPrice, stockData.movingAverages?.MA10)}</div>
                                </div>
                                <div className="flex justify-between items-center bg-muted/50 p-2 rounded">
                                    <span className="text-xs font-medium">20MA (月線)</span>
                                    <div className="text-sm">{formatPrice(stockData.movingAverages?.MA20)} {renderMAStatus(stockData.currentPrice, stockData.movingAverages?.MA20)}</div>
                                </div>
                                <div className="flex justify-between items-center bg-muted/50 p-2 rounded">
                                    <span className="text-xs font-medium">60MA (季線)</span>
                                    <div className="text-sm">{formatPrice(stockData.movingAverages?.MA60)} {renderMAStatus(stockData.currentPrice, stockData.movingAverages?.MA60)}</div>
                                </div>
                                <div className="flex justify-between items-center bg-muted/50 p-2 rounded col-span-2">
                                    <span className="text-xs font-medium">240MA (年線)</span>
                                    <div className="text-sm">{formatPrice(stockData.movingAverages?.MA240)} {renderMAStatus(stockData.currentPrice, stockData.movingAverages?.MA240)}</div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Fundamentals & Chips */}
                    <div className="grid gap-4 md:grid-rows-2 lg:col-span-2">
                        {/* Chips / Ownership */}
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-lg">
                                <TermTooltip
                                    term="籌碼佈局 (Ownership Structure)"
                                    explanation="追蹤股票的持有結構：外資、投信等機構法人，以及公司內部人士的持股比率。法人持股高代表機構認可；內部人持股高代表管理層對公司有信心。"
                                    learnMore={[{ label: "Investopedia：Institutional Investor", url: "https://www.investopedia.com/terms/i/institutionalinvestor.asp" }]}
                                />
                            </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2 pt-2">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-muted-foreground">機構法人持有 (Institutions)</span>
                                    <span className="font-bold text-purple-500">{formatPercent(stockData.institutionsPercentHeld)}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-muted-foreground">內部人持有 (Insiders)</span>
                                    <span className="font-bold">{formatPercent(stockData.insidersPercentHeld)}</span>
                                </div>
                                <div className="flex justify-between items-center pt-2 border-t">
                                    <span className="text-sm text-muted-foreground">推估流通持股 (Public Float)</span>
                                    <span className="font-bold text-blue-500">
                                        {stockData.institutionsPercentHeld ? formatPercent(1 - Number(stockData.institutionsPercentHeld) - Number(stockData.insidersPercentHeld || 0)) : '---'}
                                    </span>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Financial Report */}
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-lg">近期財報 (Financial Data)</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2 pt-2">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-muted-foreground">
                                        <TermTooltip
                                            term="近四季 EPS (TTM)"
                                            explanation="過去 12 個月（四季）累計的每股盈餘。EPS = 稅後淨利 / 流通股數。數字越高代表公司每股賺越多，是評估獲利能力最基本的指標。"
                                            learnMore={[{ label: "Investopedia：EPS", url: "https://www.investopedia.com/terms/e/eps.asp" }]}
                                        />
                                    </span>
                                    <span className="font-bold">{formatPrice(stockData.trailingEps)}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-muted-foreground">
                                        <TermTooltip
                                            term="預估本益比 (Forward P/E)"
                                            explanation="以分析師預測的未來 12 個月 EPS 計算的本益比（股價/預估EPS）。反映市場對公司未來成長的預期。數字越低可能越便宜，但需與同產業比較。"
                                            learnMore={[{ label: "Investopedia：P/E Ratio", url: "https://www.investopedia.com/terms/p/price-earningsratio.asp" }]}
                                        />
                                    </span>
                                    <span className="font-bold text-yellow-500">{stockData.forwardPE ? stockData.forwardPE.toFixed(2) : '---'}</span>
                                </div>
                                <div className="grid grid-cols-3 gap-2 pt-2 border-t mt-2">
                                    <div className="flex flex-col items-center justify-center p-2 bg-muted/30 rounded">
                                        <span className="text-[10px] text-muted-foreground mb-1">營收成長 (YoY)</span>
                                        <span className={`text-xs font-bold ${Number(stockData.revenueGrowth) >= 0 ? 'text-green-500' : 'text-red-500'}`}>{formatPercent(stockData.revenueGrowth)}</span>
                                    </div>
                                    <div className="flex flex-col items-center justify-center p-2 bg-muted/30 rounded">
                                        <span className="text-[10px] text-muted-foreground mb-1">
                                            <TermTooltip term="毛利率" explanation="(營收 - 直接成本) / 營收。反映產品競爭力與定價能力。軟體業通常 >70%，代工業較低。毛利率持續下滑需注意競爭壓力。" learnMore={[{ label: "Investopedia：Gross Margin", url: "https://www.investopedia.com/terms/g/gross_profit_margin.asp" }]} />
                                        </span>
                                        <span className="text-xs font-bold text-blue-500">{formatPercent(stockData.grossMargins)}</span>
                                    </div>
                                    <div className="flex flex-col items-center justify-center p-2 bg-muted/30 rounded">
                                        <span className="text-[10px] text-muted-foreground mb-1">營益率 (Op Margin)</span>
                                        <span className="text-xs font-bold text-blue-500">{formatPercent(stockData.operatingMargins)}</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>

                {/* Taiwan Stock Financials — only shown for .TW stocks */}
                {financialData && (
                    <Card className="mt-4">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-lg flex items-center gap-2">
                                台股財報概況
                                <Badge variant="secondary">FinMind</Badge>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* Balance KPIs */}
                            <div className="flex gap-3 flex-wrap">
                                <div className="flex items-center gap-1.5">
                                    <span className="text-xs text-muted-foreground">
                                        <TermTooltip term="負債比率" explanation="總負債 / 總資產。越低代表財務越健康。一般 <50% 較佳，但銀行業例外。需搭配流動比率評估短期償債能力。" learnMore={[{ label: "Investopedia：Debt Ratio", url: "https://www.investopedia.com/terms/d/debtratio.asp" }]} />
                                    </span>
                                    <Badge variant={financialData.balance.debtRatio > 60 ? 'destructive' : 'default'}>
                                        {financialData.balance.debtRatio > 0 ? `${financialData.balance.debtRatio}%` : '---'}
                                    </Badge>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <span className="text-xs text-muted-foreground">
                                        <TermTooltip term="ROE 股東權益報酬率" explanation="稅後淨利 / 股東權益。反映公司用股東的錢賺了多少。巴菲特認為好公司 ROE 應長期 >15%。" learnMore={[{ label: "Investopedia：ROE", url: "https://www.investopedia.com/terms/r/returnonequity.asp" }]} />
                                    </span>
                                    <Badge variant={financialData.balance.roe > 15 ? 'default' : 'secondary'}>
                                        {financialData.balance.roe > 0 ? `${financialData.balance.roe}%` : '---'}
                                    </Badge>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <span className="text-xs text-muted-foreground">流動比率</span>
                                    <Badge variant={financialData.balance.currentRatio >= 2 ? 'default' : 'secondary'}>
                                        {financialData.balance.currentRatio > 0 ? financialData.balance.currentRatio : '---'}
                                    </Badge>
                                </div>
                            </div>

                            {/* EPS Bar Chart */}
                            {financialData.income && financialData.income.length > 0 && (
                                <div>
                                    <p className="text-xs text-muted-foreground mb-2">近季 EPS（元）</p>
                                    <div className="h-40">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={financialData.income} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                                                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                                                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(2)} />
                                                <YAxis tick={{ fontSize: 10 }} width={35} />
                                                <Tooltip formatter={(v: number | undefined) => [v != null ? `$${v}` : '', 'EPS']} labelFormatter={d => `季度：${d}`} />
                                                <Bar dataKey="eps" radius={[3, 3, 0, 0]}>
                                                    {financialData.income.map((entry: any, idx: number) => (
                                                        <Cell key={idx} fill={entry.eps >= 0 ? '#10b981' : '#ef4444'} />
                                                    ))}
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            )}

                            {/* Dividend History */}
                            {financialData.dividends && financialData.dividends.length > 0 && (
                                <div>
                                    <p className="text-xs text-muted-foreground mb-2">歷年股利</p>
                                    <table className="w-full text-xs">
                                        <thead>
                                            <tr className="border-b text-muted-foreground">
                                                <th className="text-left py-1 pr-3">年度</th>
                                                <th className="text-right py-1 pr-3">現金股利（元）</th>
                                                <th className="text-right py-1">股票股利（元）</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {financialData.dividends.map((d: any) => (
                                                <tr key={d.year} className="border-b last:border-0">
                                                    <td className="py-1 pr-3">{d.year}</td>
                                                    <td className="py-1 pr-3 text-right font-mono text-green-600 dark:text-green-400">{d.cashDividend > 0 ? d.cashDividend : '—'}</td>
                                                    <td className="py-1 text-right font-mono">{d.stockDividend > 0 ? d.stockDividend : '—'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {financialData.income?.length === 0 && financialData.dividends?.length === 0 && (
                                <p className="text-sm text-muted-foreground">FinMind 目前無此股票財報資料</p>
                            )}
                        </CardContent>
                    </Card>
                )}
                </>
            )}
        </div>
    );
}
