import YahooFinance from 'yahoo-finance2';
import { SMA, RSI, MACD, BollingerBands } from 'technicalindicators';

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
    // SMA 5 (週線), SMA 20 (月線), SMA 60 (季線)
    const sma5 = SMA.calculate({ period: 5, values: closePrices });
    const sma20 = SMA.calculate({ period: 20, values: closePrices });
    const sma60 = SMA.calculate({ period: 60, values: closePrices });

    const currentSma5 = sma5.length > 0 ? sma5[sma5.length - 1] : null;
    const currentSma20 = sma20.length > 0 ? sma20[sma20.length - 1] : null;
    const currentSma60 = sma60.length > 0 ? sma60[sma60.length - 1] : null;

    // RSI 14
    const rsi14 = RSI.calculate({ period: 14, values: closePrices });
    const currentRsi = rsi14.length > 0 ? rsi14[rsi14.length - 1] : null;

    // MACD (12, 26, 9)
    const macd = MACD.calculate({ values: closePrices, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false });
    const currentMacd = macd.length > 0 ? macd[macd.length - 1] : null;

    const currentPrice = quote.regularMarketPrice || closePrices[closePrices.length - 1];

    // Basic Trend Analysis Heuristic with SMA5
    let trend = "盤整 (Neutral)";
    if (currentSma5 && currentSma20 && currentSma60) {
        if (currentPrice > currentSma5 && currentSma5 > currentSma20 && currentSma20 > currentSma60) trend = "強勢多頭 (Strong Bullish)";
        else if (currentPrice > currentSma20 && currentSma20 > currentSma60) trend = "多頭排列 (Bullish)";
        else if (currentPrice < currentSma5 && currentSma5 < currentSma20 && currentSma20 < currentSma60) trend = "強勢空頭 (Strong Bearish)";
        else if (currentPrice < currentSma20 && currentSma20 < currentSma60) trend = "空頭排列 (Bearish)";
        else if (currentPrice > currentSma20) trend = "短多反彈 (Short-term Bullish)";
        else if (currentPrice < currentSma20) trend = "短空回檔 (Short-term Bearish)";
    }

    // Burst Volume Analysis (爆量判定)
    const avgVolume20 = SMA.calculate({ period: 20, values: volumes });
    const currentAvgVol = avgVolume20.length > 0 ? avgVolume20[avgVolume20.length - 1] : 0;
    const currentVol = volumes[volumes.length - 1];
    const isVolumeBurst = currentVol > currentAvgVol * 2;

    // ── 新增：布林通道 (Bollinger Bands, 20日 2σ) ─────────────────────────
    const bb = BollingerBands.calculate({ period: 20, values: closePrices, stdDev: 2 });
    const currentBB = bb.length > 0 ? bb[bb.length - 1] : null;
    // 布林位置：price 相對於通道的百分位 (0=下軌, 1=上軌)
    const bbPercent = currentBB
        ? (currentPrice - currentBB.lower) / (currentBB.upper - currentBB.lower)
        : null;
    // 通道寬度佔中軌比例（越小代表即將爆發）
    const bbWidth = currentBB ? (currentBB.upper - currentBB.lower) / currentBB.middle : null;

    let bbPosition = "通道中段";
    if (bbPercent !== null) {
        if (bbPercent > 1.0)       bbPosition = "突破上軌（超買警戒）";
        else if (bbPercent > 0.8)  bbPosition = "接近上軌（偏強）";
        else if (bbPercent < 0.0)  bbPosition = "跌破下軌（超賣警戒）";
        else if (bbPercent < 0.2)  bbPosition = "接近下軌（偏弱）";
        else                       bbPosition = "通道中段";
    }
    const bbNarrow = bbWidth !== null && bbWidth < 0.06; // 通道收窄：即將大幅波動

    // ── 新增：MACD 交叉偵測 ───────────────────────────────────────────────
    const prevMacd = macd.length > 1 ? macd[macd.length - 2] : null;
    let macdCrossover: 'golden' | 'death' | 'none' = 'none';
    if (currentMacd?.MACD != null && currentMacd?.signal != null &&
        prevMacd?.MACD != null && prevMacd?.signal != null) {
        const prevDiff = prevMacd.MACD - prevMacd.signal;
        const currDiff = currentMacd.MACD - currentMacd.signal;
        if (prevDiff < 0 && currDiff >= 0) macdCrossover = 'golden'; // 黃金交叉
        if (prevDiff > 0 && currDiff <= 0) macdCrossover = 'death';  // 死亡交叉
    }

    // MACD 柱狀圖趨勢（最近 3 根）
    const recentHistograms = macd.slice(-3).map(m => m.histogram ?? 0);
    let macdHistogramTrend: 'increasing' | 'decreasing' | 'flat' = 'flat';
    if (recentHistograms.length >= 2) {
        const allUp = recentHistograms.every((v, i, a) => i === 0 || v > a[i - 1]);
        const allDown = recentHistograms.every((v, i, a) => i === 0 || v < a[i - 1]);
        if (allUp) macdHistogramTrend = 'increasing';
        else if (allDown) macdHistogramTrend = 'decreasing';
    }

    // ── 新增：RSI 方向（最近 3 個 RSI 值） ───────────────────────────────
    const recentRsi = rsi14.slice(-3);
    let rsiDirection: 'rising' | 'falling' | 'flat' = 'flat';
    if (recentRsi.length >= 2) {
        const allUp = recentRsi.every((v, i, a) => i === 0 || v > a[i - 1]);
        const allDown = recentRsi.every((v, i, a) => i === 0 || v < a[i - 1]);
        if (allUp) rsiDirection = 'rising';
        else if (allDown) rsiDirection = 'falling';
    }

    // ── 新增：量價關係確認 ────────────────────────────────────────────────
    // 比較最近 5 天的收盤價與成交量趨勢
    const recent5Prices = closePrices.slice(-5);
    const recent5Volumes = volumes.slice(-5);
    const priceUp = recent5Prices[4] > recent5Prices[0];
    const volUp = recent5Volumes[4] > recent5Volumes[0];
    let volumePriceConfirmation: string;
    if (priceUp && volUp)        volumePriceConfirmation = "量增價漲（健康多頭，確認度高）";
    else if (priceUp && !volUp)  volumePriceConfirmation = "量縮價漲（上漲動能不足，需謹慎）";
    else if (!priceUp && volUp)  volumePriceConfirmation = "量增價跌（賣壓沉重，空頭確認）";
    else                         volumePriceConfirmation = "量縮價跌（無量下跌，跌勢或趨緩）";

    // ── 新增：訊號衝突偵測 ────────────────────────────────────────────────
    const signalConflicts: string[] = [];
    // RSI 超賣但 MACD 仍在死叉
    if (currentRsi !== null && currentRsi < 35 && currentMacd?.MACD != null && currentMacd?.signal != null &&
        currentMacd.MACD < currentMacd.signal) {
        signalConflicts.push("RSI 超賣但 MACD 仍空頭交叉（反彈訊號未確立，需等待 MACD 轉強）");
    }
    // RSI 超買但 MACD 黃金交叉
    if (currentRsi !== null && currentRsi > 65 && macdCrossover === 'golden') {
        signalConflicts.push("MACD 黃金交叉但 RSI 已超買（動能強但追高風險高）");
    }
    // 多頭排列但量縮
    if ((trend.includes("Bullish") || trend.includes("多頭")) && !volUp && !isVolumeBurst) {
        signalConflicts.push("均線多頭排列但近期量縮（上漲缺乏量能支撐，注意假突破）");
    }
    // 布林通道收窄（方向未定）
    if (bbNarrow) {
        signalConflicts.push("布林通道收窄（即將出現方向性突破，但方向未定，等待確認）");
    }

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
            sma5: currentSma5,
            sma20: currentSma20,
            sma60: currentSma60,
            rsi: currentRsi,
            rsiDirection,
            macd: currentMacd,
            macdCrossover,
            macdHistogramTrend,
            bollingerBands: currentBB,
            bbPosition,
            bbNarrow,
            isVolumeBurst,
            currentVolume: currentVol,
            averageVolume20: currentAvgVol,
            volumePriceConfirmation,
            signalConflicts,
        },
        news
    };
}
