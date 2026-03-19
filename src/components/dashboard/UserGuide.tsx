"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const features = [
  {
    tab: "市場動態",
    icon: "📈",
    badge: "首頁",
    summary: "開盤前 5 分鐘快速掌握全球市場",
    steps: [
      "開啟儀表板後預設顯示此頁，S&P 500、台灣加權、NASDAQ、美元/台幣每 60 秒自動更新",
      "「資產配置」圓餅圖會依投資組合即時計算各類別佔比",
      "「財經新聞」從 Yahoo Finance 抓取最新 5 則，「個人化動態牆」則顯示你在「自訂資料源」新增的消息",
    ],
    tip: "數字顯示 '...' 代表資料讀取中，稍等即可，無需手動刷新。",
  },
  {
    tab: "個股健康度",
    icon: "🔍",
    badge: "核心功能",
    summary: "輸入股票代號，取得完整技術面 + AI 解讀",
    steps: [
      "在搜尋欄輸入股票代號：台股用 4 位數字（例如 2330）或加上 .TW（例如 2330.TW）；美股直接輸入代號（例如 AAPL）",
      "上方卡片顯示基本面：均線（5MA/20MA/60MA/240MA）、籌碼（法人持股）、財報（EPS、本益比、毛利率）",
      "下方「深度技術分析」區塊稍後出現：RSI、MACD 交叉狀態、布林通道位置、量價關係",
      "AI 解讀卡片以顏色區分多（綠）/ 空（紅）/ 觀望（黃），並列出關鍵訊號、風險、操作方向",
      "台股額外顯示 FinMind 財報資料：負債比、ROE、近季 EPS 柱狀圖、歷年股利",
    ],
    tip: "AI 解讀約需 5-10 秒，基本面數據會先出現，等待時可先閱讀。",
  },
  {
    tab: "投資組合",
    icon: "💼",
    badge: "核心功能",
    summary: "記錄買賣交易，追蹤持倉損益",
    steps: [
      "點選「新增帳戶」建立紙上交易帳戶（模擬）或實際帳戶（純紀錄）",
      "先「存入資金」設定初始金額",
      "點選「新增交易」填入股票代號、買/賣、股數、成交價、日期",
      "儀表板自動計算持倉成本、當前市值、未實現損益（%）",
      "可建立「分類」（例如：科技股、金融股）方便管理",
    ],
    tip: "紙上交易帳戶不影響真實資金，適合練習和驗證策略。",
  },
  {
    tab: "每日推薦",
    icon: "🎯",
    badge: "AI 功能",
    summary: "每個交易日早上 8 點，AI 自動產生個股推薦報告",
    steps: [
      "系統在每個交易日早上 8 點（週一至週五）自動執行，無需手動觸發",
      "分析對象包含你持有的股票 + 自選股清單中的股票",
      "每支股票給出評級：STRONG_BUY / BUY / HOLD / REDUCE / SELL / WATCH",
      "點選個股可查看 AI 給出的理由、趨勢判斷、RSI 數值",
      "若今日還沒有報告，可點選「立即產生」手動觸發",
    ],
    tip: "需要設定 OPENAI_API_KEY 或 GEMINI_API_KEY 環境變數才能使用 AI 功能。",
  },
  {
    tab: "策略回測",
    icon: "⏪",
    badge: "進階功能",
    summary: "用歷史資料驗證你的買賣策略",
    steps: [
      "輸入股票代號與回測區間（開始/結束日期）",
      "設定策略條件：例如「RSI < 30 買入，RSI > 70 賣出」",
      "系統以歷史收盤價模擬交易，計算報酬率、最大回撤、勝率",
      "結果以折線圖呈現資產曲線，並列出每筆模擬交易明細",
    ],
    tip: "回測結果僅供參考，過去績效不代表未來表現。",
  },
  {
    tab: "選股篩選",
    icon: "🔎",
    badge: "進階功能",
    summary: "用技術條件批次篩選符合條件的股票",
    steps: [
      "設定篩選條件：RSI 範圍、均線排列、成交量倍數等",
      "輸入一批股票代號（可貼上清單），點選執行",
      "系統逐一分析並回傳符合條件的股票清單",
    ],
    tip: "篩選的股票數量越多，花費時間越長，建議每次不超過 20 支。",
  },
  {
    tab: "自選股清單",
    icon: "📊",
    badge: "整合功能",
    summary: "連結 Google Sheets，同步你的自選股",
    steps: [
      "在 Google Sheets 建立一份試算表，A 欄填入股票代號",
      "將試算表設為「任何知道連結的人可以檢視」",
      "到「自選股清單」頁籤，貼上試算表的公開 URL",
      "系統會自動讀取並顯示各股即時報價",
    ],
    tip: "Google Sheets URL 格式為 https://docs.google.com/spreadsheets/d/...，貼整個網址即可。",
  },
  {
    tab: "自訂資料源",
    icon: "📰",
    badge: "整合功能",
    summary: "訂閱任意 RSS 或財經網站，聚合到首頁動態牆",
    steps: [
      "點選「新增資料源」，輸入名稱、選擇類型（RSS 或 HTML）、貼上網址",
      "儲存後，首頁「個人化動態牆」就會自動顯示最新消息",
      "可新增多個來源，例如：MoneyDJ RSS、財報狗、各大財經媒體",
    ],
    tip: "RSS 格式支援最佳（.xml 結尾或 /rss/ 路徑）。HTML 類型抓取成功率依網站結構而定。",
  },
];

const faqs = [
  {
    q: "為什麼股票資料顯示 'Loading...' 或 '---'？",
    a: "資料來自 Yahoo Finance API，若網路不穩定或盤後時段部分資料可能無法取得。等待 60 秒後自動重試，或重新整理頁面。",
  },
  {
    q: "AI 分析功能說「API Key 未設定」怎麼辦？",
    a: "需要在伺服器環境變數設定 OPENAI_API_KEY（OpenAI）或 GEMINI_API_KEY（Google Gemini）。本地開發可在 .env.local 檔案設定；部署到 Vercel 則在 Project Settings → Environment Variables 新增。",
  },
  {
    q: "台股代號要怎麼輸入？",
    a: "直接輸入 4 位數字即可（例如 2330），系統會自動補上 .TW 後綴。ETF 同理（例如 0050）。",
  },
  {
    q: "每日推薦報告沒有自動產生？",
    a: "自動排程需要部署到 Vercel 並開啟 Cron Job 功能（vercel.json 已設定）。本地開發環境不支援自動排程，請手動點選「立即產生」按鈕。",
  },
  {
    q: "投資組合的損益計算正確嗎？",
    a: "損益以「當前即時報價 × 持股數 − 買入成本」計算，即時報價每 10 秒更新一次。匯率轉換採當下 USD/TWD 即時匯率。",
  },
];

function FeatureCard({ feature }: { feature: typeof features[0] }) {
  return (
    <details className="group">
      <summary className="flex items-center gap-3 cursor-pointer list-none p-4 rounded-lg hover:bg-muted/50 transition-colors">
        <span className="text-2xl">{feature.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold">{feature.tab}</span>
            <Badge variant="outline" className="text-xs">{feature.badge}</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{feature.summary}</p>
        </div>
        <span className="text-muted-foreground text-sm shrink-0 group-open:rotate-180 transition-transform">▾</span>
      </summary>
      <div className="px-4 pb-4 pt-1 space-y-3">
        <ol className="space-y-2">
          {feature.steps.map((step, i) => (
            <li key={i} className="flex gap-3 text-sm">
              <span className="shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-bold mt-0.5">{i + 1}</span>
              <span className="text-muted-foreground leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>
        <div className="flex gap-2 items-start bg-blue-500/10 border border-blue-500/20 rounded-md p-3">
          <span className="shrink-0 text-blue-400">💡</span>
          <p className="text-xs text-blue-300 leading-relaxed">{feature.tip}</p>
        </div>
      </div>
    </details>
  );
}

export function UserGuide() {
  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Hero */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <span className="text-4xl">🗺️</span>
            <div>
              <h2 className="text-xl font-bold mb-1">使用說明</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                這份指南說明儀表板每個功能的用途與操作步驟。
                點選各功能名稱可展開詳細說明。
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                <Badge>11 個功能模組</Badge>
                <Badge variant="secondary">雙 AI 引擎（OpenAI + Gemini）</Badge>
                <Badge variant="secondary">台股 / 美股 / 外匯</Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick start */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            🚀 首次設定
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3">
            {[
              { label: "確認環境變數", desc: "在 .env.local（本地）或 Vercel 環境變數（上線）設定：OPENAI_API_KEY、GEMINI_API_KEY、DATABASE_URL（PostgreSQL）" },
              { label: "建立帳戶", desc: "到「投資組合」頁籤 → 新增帳戶 → 存入初始資金，再開始記錄交易" },
              { label: "設定自選股", desc: "到「自選股清單」連結 Google Sheets，或直接在「選股篩選」手動輸入代號" },
              { label: "訂閱新聞源（選擇性）", desc: "到「自訂資料源」新增你常看的財經 RSS 網址，首頁動態牆就會自動更新" },
            ].map((item, i) => (
              <li key={i} className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold mt-0.5">{i + 1}</span>
                <div>
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{item.desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {/* Feature list */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">功能說明</CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-border/50 p-0 px-2 pb-2">
          {features.map((f) => (
            <FeatureCard key={f.tab} feature={f} />
          ))}
        </CardContent>
      </Card>

      {/* FAQ */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">常見問題 FAQ</CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-border/50 p-0 px-2 pb-2">
          {faqs.map((faq, i) => (
            <details key={i} className="group">
              <summary className="flex items-center justify-between cursor-pointer list-none p-4 hover:bg-muted/50 rounded-lg transition-colors">
                <span className="text-sm font-medium pr-4">{faq.q}</span>
                <span className="text-muted-foreground shrink-0 group-open:rotate-180 transition-transform">▾</span>
              </summary>
              <p className="text-sm text-muted-foreground px-4 pb-4 pt-1 leading-relaxed">{faq.a}</p>
            </details>
          ))}
        </CardContent>
      </Card>

      {/* Footer note */}
      <p className="text-xs text-muted-foreground text-center pb-4">
        本平台提供資訊整合與模擬工具，不構成任何投資建議。投資有風險，決策前請自行判斷。
      </p>
    </div>
  );
}
