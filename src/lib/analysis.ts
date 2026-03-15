import YahooFinance from 'yahoo-finance2';
import { SMA, RSI, MACD } from 'technicalindicators';

const yahooFinance = new YahooFinance();

export async function analyzeStock(symbolParam: string) {
    // Resolve Chinese names to symbols if necessary using our heuristic
    let querySymbol = symbolParam;
    const isChinese = /[\u4e00-\u9fa5]/.test(symbolParam);

    // Very basic hardcoded fallbacks if user inputs Chinese names in their sheet
    if (isChinese) {
        if (symbolParam.includes("台積電")) querySymbol = "2330.TW";
        else if (symbolParam.includes("聯發科")) querySymbol = "2454.TW";
        else if (symbolParam.includes("鴻海")) querySymbol = "2317.TW";
        else if (symbolParam.includes("富邦金")) querySymbol = "2881.TW";
        else if (symbolParam.includes("長榮")) querySymbol = "2603.TW";
        else {
            // Return an error for unmapped Chinese names to avoid hallucinating
            throw new Error(`請使用標準股票代號進行分析 (無法解析: ${symbolParam})`);
        }
    }

    // Try to ensure .TW for typical 4 digit Taiwan stocks
    if (/^\d{4}$/.test(querySymbol)) {
        querySymbol = `${querySymbol}.TW`;
    }

    // 1. Fetch Quote
    let quote;
    try {
        quote = await yahooFinance.quote(querySymbol);
    } catch (e) {
        throw new Error(`找不到代號 ${querySymbol} 的即時資訊`);
    }

    // 2. Fetch Historical Data (Last 100 days roughly)
    const period1 = new Date();
    period1.setDate(period1.getDate() - 150); // Get enough padding for 60-day SMA

    const historical = await yahooFinance.historical(querySymbol, {
        period1: period1.toISOString().split('T')[0],
        period2: new Date().toISOString().split('T')[0],
        interval: '1d'
    });

    if (!historical || historical.length === 0) {
        throw new Error("無法取得歷史價格進行技術分析");
    }

    const closePrices = historical.map(h => h.close).filter(c => c !== null) as number[];
    const volumes = historical.map(h => h.volume || 0);

    // 3. Calculate Technical Indicators
    // SMA 20 (月線), SMA 60 (季線)
    const sma20 = SMA.calculate({ period: 20, values: closePrices });
    const sma60 = SMA.calculate({ period: 60, values: closePrices });

    const currentSma20 = sma20.length > 0 ? sma20[sma20.length - 1] : null;
    const currentSma60 = sma60.length > 0 ? sma60[sma60.length - 1] : null;

    // RSI 14
    const rsi14 = RSI.calculate({ period: 14, values: closePrices });
    const currentRsi = rsi14.length > 0 ? rsi14[rsi14.length - 1] : null;

    // MACD (12, 26, 9)
    const macd = MACD.calculate({ values: closePrices, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false });
    const currentMacd = macd.length > 0 ? macd[macd.length - 1] : null;

    const currentPrice = quote.regularMarketPrice || closePrices[closePrices.length - 1];

    // Basic Trend Analysis Heuristic
    let trend = "盤整 (Neutral)";
    if (currentSma20 && currentSma60) {
        if (currentPrice > currentSma20 && currentSma20 > currentSma60) trend = "多頭排列 (Bullish)";
        else if (currentPrice < currentSma20 && currentSma20 < currentSma60) trend = "空頭排列 (Bearish)";
        else if (currentPrice > currentSma20) trend = "短多 (Short-term Bullish)";
        else if (currentPrice < currentSma20) trend = "短空 (Short-term Bearish)";
    }

    // Burst Volume Analysis (爆量判定)
    const avgVolume20 = SMA.calculate({ period: 20, values: volumes });
    const currentAvgVol = avgVolume20.length > 0 ? avgVolume20[avgVolume20.length - 1] : 0;
    const currentVol = volumes[volumes.length - 1];
    const isVolumeBurst = currentVol > currentAvgVol * 2;

    // 4. Fetch Latest News
    let news: any[] = [];
    try {
        const searchRes = await yahooFinance.search(querySymbol, { newsCount: 5 }) as any;
        if (searchRes && searchRes.news) {
            news = searchRes.news.map((n: any) => ({
                title: n.title,
                link: n.link,
                publisher: n.publisher,
                time: n.providerPublishTime ? new Date(n.providerPublishTime).toLocaleString() : ''
            }));
        }
    } catch (e) {
        console.warn("Could not fetch news for", querySymbol);
    }

    return {
        symbol: querySymbol,
        name: quote.shortName || quote.longName || querySymbol,
        price: currentPrice,
        changePercent: quote.regularMarketChangePercent,
        technical: {
            trend,
            sma20: currentSma20,
            sma60: currentSma60,
            rsi: currentRsi,
            macd: currentMacd,
            isVolumeBurst,
            currentVolume: currentVol,
            averageVolume20: currentAvgVol
        },
        news
    };
}
