import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import yahooFinance from 'yahoo-finance2';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        // Initialize AI clients inside the handler
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'dummy_key_for_build' });
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'dummy_key_for_build');

        const { symbol } = await request.json();

        if (!symbol) {
            return NextResponse.json({ error: '請提供股票代號' }, { status: 400 });
        }

        // 1. Fetch Real-time Data from Yahoo Finance to prevent AI hallucinations
        let marketDataStr = "無法取得即時市場報價";
        let newsStr = "無近期新聞";

        try {
            // Determine if the user inputs a Taiwanese stock without the .TW suffix (e.g., "2330")
            let querySymbol = symbol;
            if (/^\d{4}$/.test(symbol)) {
                querySymbol = `${symbol}.TW`; // Append .TW for standard 4-digit Taiwanese stocks
            }

            const quote = await yahooFinance.quote(querySymbol) as any;
            if (quote) {
                marketDataStr = `
- 股票名稱：${quote.shortName || quote.longName || symbol}
- 最新股價：${quote.regularMarketPrice} ${quote.currency}
- 當日漲跌幅：${quote.regularMarketChangePercent?.toFixed(2)}%
- 52週最高/最低：${quote.fiftyTwoWeekHigh} / ${quote.fiftyTwoWeekLow}
- 本益比 (P/E)：${quote.trailingPE ? quote.trailingPE.toFixed(2) : 'N/A'}
- 預估本益比 (Forward P/E)：${quote.forwardPE ? quote.forwardPE.toFixed(2) : 'N/A'}
- 市值：${quote.marketCap ? (quote.marketCap / 100000000).toFixed(2) + '億' : 'N/A'}
                `.trim();
            }

            // Fetch a few recent news articles for context
            const searchResult = await yahooFinance.search(querySymbol, { newsCount: 3 }) as any;
            if (searchResult.news && searchResult.news.length > 0) {
                newsStr = searchResult.news.map((item: any, idx: number) => `${idx + 1}. [${new Date(item.providerPublishTime).toLocaleDateString()}] ${item.title}`).join('\n');
            }
        } catch (dataError) {
            console.warn("Failed to fetch yahoo finance data for context:", dataError);
        }

        const systemPrompt = `你是一位精通股市的『投資小老師』，也是一位數據分析師。
請根據我提供給你的【最新即時數據】與【近期新聞】，來回答使用者的問題。
絕對不可以使用舊有的記憶來瞎編本益比、股價或新聞！如果你不知道，請直接說資料不足。

你的回答必須包含以下三個結構：
1. 【概念股分類】：這家公司主要在做什麼？屬於哪些熱門概念股？
2. 【近期研究關鍵點】：根據提供的新聞與基本面，列出 3 個近期值得關注的重點（利多或利空）。
3. 【小老師白話看法】：綜合即時股價與本益比，用一段話總結你對這檔股票目前的看法（例如：是否過熱、跌深反彈等，請客觀分析）。`;

        const userPrompt = `
請分析這檔股票：${symbol}

===== 系統提供的即時數據 =====
【基本面與報價】
${marketDataStr}

【近期新聞重點】
${newsStr}
==============================

請開始你的分析：`;

        // OpenAI Request
        const openaiPromise = openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            temperature: 0.5, // Lower temperature for more factual responses
        }).then(res => res.choices[0].message.content).catch(err => {
            console.error("OpenAI Error:", err);
            return "OpenAI 分析失敗，請確認 API Key 是否設定正確。";
        });

        // Gemini Request
        const geminiPromise = (async () => {
            try {
                const model = genAI.getGenerativeModel({
                    model: "gemini-2.5-flash",
                    systemInstruction: systemPrompt
                });
                const result = await model.generateContent(userPrompt);
                return result.response.text();
            } catch (err) {
                console.error("Gemini Error:", err);
                return "Gemini 分析失敗，請確認 API Key 是否設定正確。";
            }
        })();

        // Execute both in parallel
        const [openaiResult, geminiResult] = await Promise.all([openaiPromise, geminiPromise]);

        return NextResponse.json({
            result: {
                openai: openaiResult,
                gemini: geminiResult
            }
        });

    } catch (error: any) {
        console.error("AI API Error:", error);
        return NextResponse.json({ error: error.message || 'AI 服務暫時無法回應。' }, { status: 500 });
    }
}
