import { NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';
import { claudeText } from '@/lib/claude';

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        const { symbol } = await request.json();

        if (!symbol) {
            return NextResponse.json({ error: '請提供股票代號' }, { status: 400 });
        }

        // 1. Fetch real-time data to prevent hallucinations
        let marketDataStr = '無法取得即時市場報價';
        let newsStr = '無近期新聞';

        try {
            const querySymbol = /^\d{4}$/.test(symbol) ? `${symbol}.TW` : symbol;

            try {
                const quote = await yahooFinance.quote(querySymbol) as any;
                if (quote) {
                    marketDataStr = `
- 股票名稱：${quote.shortName || quote.longName || symbol}
- 最新股價：${quote.regularMarketPrice} ${quote.currency}
- 當日漲跌幅：${quote.regularMarketChangePercent?.toFixed(2)}%
- 52週最高/最低：${quote.fiftyTwoWeekHigh} / ${quote.fiftyTwoWeekLow}
- 本益比 (P/E)：${quote.trailingPE ? quote.trailingPE.toFixed(2) : 'N/A'}
- 預估本益比 (Forward P/E)：${quote.forwardPE ? quote.forwardPE.toFixed(2) : 'N/A'}
- 市值：${quote.marketCap ? (quote.marketCap / 100000000).toFixed(2) + '億' : 'N/A'}`.trim();
                }
            } catch {
                console.warn('Quote failed for', querySymbol);
            }

            try {
                const searchResult = await yahooFinance.search(querySymbol, { newsCount: 3 }) as any;
                if (searchResult.news?.length > 0) {
                    newsStr = searchResult.news
                        .map((item: any, idx: number) => `${idx + 1}. [${new Date(item.providerPublishTime).toLocaleDateString()}] ${item.title}`)
                        .join('\n');
                }
            } catch {
                console.warn('Search failed for', querySymbol);
            }
        } catch (dataError) {
            console.warn('Failed to fetch Yahoo Finance data:', dataError);
        }

        const systemPrompt = `你是一位精通股市的『大師級投資分析師』。
使用者會給你一支股票的代號或名稱，以及系統自動爬取的「最新即時報價」與「即時新聞」。

【絕對規則】：
1. 嚴禁使用你的舊記憶來預測股價或瞎編新聞，所有數據（價格、本益比、新聞背景）都必須基於我給你的《即時數據》！如果數據顯示 N/A，請直接說資料不足。
2. 為了讓回覆看起來整齊劃一，你【必須】完全遵循下方這個嚴格的 Markdown 範本格式來回答，不要產生範本以外的廢話：

### 🎯 概念股分類
(用 1~2 句話說明這家公司的主力業務，以及它所屬的熱門概念板塊)

### 📊 即時數據解析
(結合系統給你的現價、本益比、市值等，用 1~2 句話進行客觀掃描)

### 💡 近期焦點
- **重點一**：(根據近期新聞總結)
- **重點二**：(根據近期新聞總結)

### 👨‍🏫 分析師講評
(客觀綜合以上數據，用 50 字以內給出這檔股票當前位階的看法，不要給絕對買賣建議)`;

        const userPrompt = `
請分析這檔股票：${symbol}

===== 系統提供的即時數據 =====
【基本面與報價】
${marketDataStr}

【近期新聞重點】
${newsStr}
==============================

請開始你的分析：`;

        const claudeResult = await claudeText(systemPrompt, userPrompt, 1024);

        return NextResponse.json({
            result: {
                claude: claudeResult,
                // Backward-compatible keys — UI that renders openai/gemini panels still works
                openai: claudeResult,
                gemini: claudeResult,
            },
        });
    } catch (error: any) {
        console.error('AI API Error:', error);
        return NextResponse.json({ error: error.message || 'AI 服務暫時無法回應。' }, { status: 500 });
    }
}
