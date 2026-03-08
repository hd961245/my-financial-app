"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, ArrowDownRight, Activity, DollarSign, TrendingUp } from "lucide-react";
import { PortfolioTracker } from "@/components/dashboard/PortfolioTracker";
import { StockHealthAnalyzer } from "@/components/dashboard/StockHealthAnalyzer";
import { CapitalFlowTracker } from "@/components/dashboard/CapitalFlowTracker";
import { DataSourceManager } from "@/components/dashboard/DataSourceManager";
import { GoogleSheetsTracker } from "@/components/dashboard/GoogleSheetsTracker";
import { AIChatWidget } from "@/components/dashboard/AIChatWidget";
import { CommunityAssistantWidget } from "@/components/dashboard/CommunityAssistantWidget";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PieChart as RechartsPieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export default function Home() {
  const [indices, setIndices] = useState<Record<string, any>>({});
  const [news, setNews] = useState<any[]>([]);
  const [customNews, setCustomNews] = useState<any[]>([]);
  const [allocation, setAllocation] = useState<any[]>([]);

  useEffect(() => {
    const fetchIndices = async () => {
      const symbols = ["^GSPC", "^TWII", "^IXIC", "TWD=X"];
      const data: Record<string, any> = {};
      for (const sym of symbols) {
        try {
          const res = await fetch(`/api/quote?symbol=${sym}`);
          if (res.ok) data[sym] = await res.json();
        } catch (e) { console.error(e); }
      }
      setIndices(data);

      try {
        const newsRes = await fetch(`/api/news?symbol=^GSPC`);
        if (newsRes.ok) {
          const newsData = await newsRes.json();
          setNews(newsData);
        }
      } catch (e) { console.error("Failed to fetch news", e); }

      try {
        const customRes = await fetch(`/api/custom-feed`);
        if (customRes.ok) {
          const customData = await customRes.json();
          setCustomNews(customData);
        }
      } catch (e) { console.error("Failed to fetch custom feeds", e); }

      try {
        const portRes = await fetch('/api/portfolio');
        if (portRes.ok) {
          const portData = await portRes.json();
          const grouped = portData.holdings || {};
          const quotes = portData.quotes || {};

          const newAlloc = Object.entries(grouped).map(([catName, items]: [string, any]) => {
            const value = items.reduce((acc: number, item: any) => {
              const currentPrice = quotes[item.symbol]?.regularMarketPrice || item.price;
              return acc + (item.shares * currentPrice);
            }, 0);
            return { name: catName, value };
          }).filter(a => a.value > 0);

          setAllocation(newAlloc);
        }
      } catch (e) { console.error("Failed to fetch portfolio allocation", e); }
    };

    fetchIndices(); // Initial fetch

    // Set up real-time polling every 60 seconds (1 minute)
    const interval = setInterval(fetchIndices, 60000);
    return () => clearInterval(interval);
  }, []);

  const renderCard = (title: string, symbol: string, icon: React.ReactNode) => {
    const data = indices[symbol];
    const price = data?.regularMarketPrice?.toFixed(2) || "...";
    const change = data?.regularMarketChangePercent?.toFixed(2) || "0.00";
    const isUp = Number(change) >= 0;

    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          {icon}
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{price}</div>
          <p className="text-xs text-muted-foreground">
            {data ? (
              <span className={`flex items-center ${isUp ? 'text-green-500' : 'text-red-500'}`}>
                {isUp ? <ArrowUpRight className="h-3 w-3 mr-1" /> : <ArrowDownRight className="h-3 w-3 mr-1" />}
                {isUp ? '+' : ''}{change}%
              </span>
            ) : "Loading..."}
          </p>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="flex-col md:flex">
      <div className="border-b">
        <div className="flex h-16 items-center px-4">
          <h1 className="text-xl font-bold tracking-tight">金融資訊整合平台 (Financial Aggregator)</h1>
          <div className="ml-auto flex items-center space-x-4">
            {/* Nav items or Search could go here */}
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-4 p-8 pt-6">
        <div className="flex items-center justify-between space-y-2">
          <h2 className="text-3xl font-bold tracking-tight">儀表板 (Dashboard)</h2>
        </div>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">市場動態</TabsTrigger>
            <TabsTrigger value="capital">資金動向</TabsTrigger>
            <TabsTrigger value="stocks">個股健康度</TabsTrigger>
            <TabsTrigger value="portfolio">投資組合</TabsTrigger>
            <TabsTrigger value="custom">自訂資料源</TabsTrigger>
            <TabsTrigger value="watchlist">自選股清單</TabsTrigger>
            <TabsTrigger value="ai-assistant" className="font-bold text-green-600 dark:text-green-400">🤖 AI 投資大腦</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {renderCard("標普 500 (S&P 500)", "^GSPC", <TrendingUp className="h-4 w-4 text-muted-foreground" />)}
              {renderCard("台灣加權指數 (TWII)", "^TWII", <TrendingUp className="h-4 w-4 text-muted-foreground" />)}
              {renderCard("那斯達克 (NASDAQ)", "^IXIC", <Activity className="h-4 w-4 text-muted-foreground" />)}
              {renderCard("美元/台幣 (USD/TWD)", "TWD=X", <DollarSign className="h-4 w-4 text-muted-foreground" />)}
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7 mt-4">
              <Card className="col-span-4">
                <CardHeader>
                  <CardTitle>資產配置比例 (Portfolio Allocation)</CardTitle>
                </CardHeader>
                <CardContent className="h-[300px] pb-4">
                  {allocation.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-muted-foreground border-dashed border-2 rounded-md border-muted m-4">無資產或是分類資料 (No Portfolio Data)</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsPieChart>
                        <Pie
                          data={allocation}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                          label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                        >
                          {allocation.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: any) => typeof value === 'number' ? `$${value.toFixed(2)}` : value} />
                        <Legend />
                      </RechartsPieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
              <Card className="col-span-3">
                <CardHeader>
                  <CardTitle>最新財經新聞 (Latest News)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {news.length === 0 ? (
                      <div className="flex justify-center p-4">Loading news...</div>
                    ) : (
                      news.map((item, i) => (
                        <div key={i} className="flex items-start gap-4 border-b pb-4 last:border-0 last:pb-0">
                          {item.thumbnail?.resolutions?.[1]?.url ? (
                            <img src={item.thumbnail.resolutions[1].url} alt={item.title} className="w-16 h-16 bg-muted rounded-md flex-shrink-0 object-cover" />
                          ) : (
                            <div className="w-16 h-16 bg-muted rounded-md flex-shrink-0 flex items-center justify-center">📰</div>
                          )}
                          <div className="flex-1">
                            <a href={item.link} target="_blank" rel="noopener noreferrer" className="text-sm font-medium leading-none mb-1 hover:underline">
                              {item.title}
                            </a>
                            <p className="text-xs text-muted-foreground mt-1">
                              {item.providerPublishTime ? new Date(item.providerPublishTime).toLocaleString() : ''} • {item.publisher}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="capital" className="space-y-4">
            <CapitalFlowTracker />
          </TabsContent>

          <TabsContent value="stocks" className="space-y-4">
            <StockHealthAnalyzer />
          </TabsContent>

          <TabsContent value="portfolio" className="space-y-4">
            <PortfolioTracker />
          </TabsContent>

          <TabsContent value="custom" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-[1fr_2fr]">
              <div>
                <DataSourceManager />
              </div>
              <Card>
                <CardHeader>
                  <CardTitle>個人化動態牆 (Custom Feed Timeline)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {customNews.length === 0 ? (
                      <div className="flex justify-center p-4 text-muted-foreground">還沒有自訂消息，請從左側新增資料源！</div>
                    ) : (
                      customNews.map((item, i) => (
                        <div key={i} className="flex items-start gap-4 border-b pb-4 last:border-0 last:pb-0">
                          {item.thumbnail ? (
                            <img src={item.thumbnail} alt={item.title} className="w-16 h-16 bg-muted rounded-md flex-shrink-0 object-cover" />
                          ) : (
                            <div className="w-16 h-16 bg-primary/10 text-primary rounded-md flex-shrink-0 flex items-center justify-center font-bold text-xs">
                              {item.sourceType}
                            </div>
                          )}
                          <div className="flex-1">
                            <a href={item.link} target="_blank" rel="noopener noreferrer" className="text-sm font-medium leading-none mb-1 hover:underline">
                              {item.title}
                            </a>
                            <p className="text-xs text-muted-foreground mt-1">
                              {new Date(item.pubDate).toLocaleString()} • {item.sourceName}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="watchlist" className="space-y-4">
            <GoogleSheetsTracker />
          </TabsContent>

          <TabsContent value="ai-assistant" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 pt-2">
              <AIChatWidget />
              <CommunityAssistantWidget />
            </div>
          </TabsContent>

        </Tabs>
      </div>
    </div>
  );
}
