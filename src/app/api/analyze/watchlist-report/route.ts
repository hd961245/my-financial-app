import { NextResponse } from 'next/server';
import { analyzeStock } from '@/lib/analysis';
import { claudeText } from '@/lib/claude';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        const { symbols } = await request.json();

        if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
            return NextResponse.json({ error: '請提供觀察清單代號陣列' }, { status: 400 });
        }

        const stocksToAnalyze = symbols.slice(0, 10);
        const analysisReports: string[] = [];

        for (const sym of stocksToAnalyze) {
            if (!sym) continue;
            try {
                const analysis = await analyzeStock(sym);
                analysisReports.push(`
📍 **${analysis.name} (${analysis.symbol})**
- **最新收盤價**：$${analysis.price} (${analysis.changePercent >= 0 ? '+' : ''}${analysis.changePercent?.toFixed(2)}%)
- **技術面趨勢**：${analysis.technical.trend} (5日線 ${analysis.technical.sma5?.toFixed(2)}, 月線 ${analysis.technical.sma20?.toFixed(2)}, 季線 ${analysis.technical.sma60?.toFixed(2)})
- **量能判定**：${analysis.technical.isVolumeBurst ? '🔥 近日出現爆量' : '量能平穩'}
- **近期焦點新聞**：${analysis.news.length > 0 ? analysis.news[0].title : '無'}`.trim());
            } catch (err) {
                console.warn(`Failed to analyze ${sym}:`, err);
            }
        }

        if (analysisReports.length === 0) {
            return NextResponse.json({ error: '無法解析任何股票代號。' }, { status: 400 });
        }

        const systemPrompt = `你是一位精準、犀利的『首席投資策略長』。
系統剛剛替使用者掃描了他們的「觀察清單 (Watchlist)」，這是透過量化程式算出的各種技術面指標資料。

請你撰寫一份【觀察清單整體健檢建議】。

【絕對規則】：
1. 嚴禁瞎編數據！所有分析只能基於下方提供的數據。
2. 開頭先給一段 50 字以內的「整體觀察清單現狀掃描」。
3. 接著，分別給每一檔股票 2 ~ 3 句話的簡短「是否推薦建倉」建議。明確指出該等待、還是可以小量試單。
4. 【重要】請務必使用「繁體中文 (Traditional Chinese)」撰寫整份報告。
5. 使用 Markdown 格式。`;

        const userPrompt = `這是目前觀察清單的量化掃描結果：\n\n${analysisReports.join('\n\n')}\n\n請根據這些數據生成健檢與建倉建議！`;

        const finalReport = await claudeText(systemPrompt, userPrompt, 2048);

        return NextResponse.json({
            success: true,
            report: finalReport,
            rawAnalysis: analysisReports,
        });
    } catch (error: any) {
        console.error('Watchlist Analysis Error:', error);
        return NextResponse.json({ error: error.message || '生成觀察清單報告失敗' }, { status: 500 });
    }
}
