"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, BookOpen, Youtube, ExternalLink } from "lucide-react";

interface Term {
  name: string;
  nameEn: string;
  summary: string;
  detail: string;
  tags: string[];
  links: { label: string; url: string; type: "article" | "video" }[];
}

interface Resource {
  title: string;
  description: string;
  url: string;
  type: "article" | "video" | "site";
  language: "zh" | "en";
  tags: string[];
}

const TERMS: Term[] = [
  // --- Technical ---
  {
    name: "移動平均線",
    nameEn: "Moving Average (MA)",
    summary: "一段期間收盤價的平均值，用來判斷趨勢方向與支撐壓力。",
    detail:
      "常見有 5MA（週線）、20MA（月線）、60MA（季線）、240MA（年線）。當股價站上均線代表短期走強，跌破則轉弱。短均線向上穿越長均線稱為「黃金交叉」(買訊)，反之稱為「死亡交叉」(賣訊)。",
    tags: ["技術分析"],
    links: [
      { label: "Investopedia：Moving Average", url: "https://www.investopedia.com/terms/m/movingaverage.asp", type: "article" },
      { label: "均線完整教學（市場先生）", url: "https://mrmarket.com.tw/stock/article/moving-average/", type: "article" },
    ],
  },
  {
    name: "RSI 相對強弱指數",
    nameEn: "Relative Strength Index",
    summary: "衡量買賣力道的震盪指標，數值 0–100，>70 超買，<30 超賣。",
    detail:
      "RSI 由 J. Welles Wilder 於 1978 年發明，計算方式為：RSI = 100 - (100 / (1 + 平均漲幅/平均跌幅))。一般以 14 日為標準週期。RSI > 70 表示短期超買，可能面臨回調；RSI < 30 表示超賣，可能出現反彈。但在強勢趨勢中 RSI 可能長時間停留在高位。",
    tags: ["技術分析", "動能"],
    links: [
      { label: "Investopedia：RSI", url: "https://www.investopedia.com/terms/r/rsi.asp", type: "article" },
      { label: "RSI 指標教學（股感）", url: "https://www.stockfeel.com.tw/rsi相對強弱指標/", type: "article" },
    ],
  },
  {
    name: "MACD",
    nameEn: "Moving Average Convergence Divergence",
    summary: "利用兩條 EMA 之間的差值判斷趨勢轉折，金叉為買訊，死叉為賣訊。",
    detail:
      "MACD 由 Gerald Appel 發明。標準參數為 12 日 EMA - 26 日 EMA = DIF，再以 DIF 的 9 日 EMA 為信號線（DEA）。DIF 向上穿越 DEA 稱為「金叉」(可能買點)；向下穿越稱為「死叉」(可能賣點)。柱狀圖（Histogram）代表 DIF 與 DEA 的差距，由負轉正常被視為動能回升。",
    tags: ["技術分析", "動能"],
    links: [
      { label: "Investopedia：MACD", url: "https://www.investopedia.com/terms/m/macd.asp", type: "article" },
      { label: "MACD 完整教學（市場先生）", url: "https://mrmarket.com.tw/stock/article/macd/", type: "article" },
    ],
  },
  {
    name: "布林通道",
    nameEn: "Bollinger Bands",
    summary: "以 20 日均線為中軌，上下各加減 2 個標準差，判斷價格相對高低位。",
    detail:
      "由 John Bollinger 發明。上軌 = 20MA + 2σ，下軌 = 20MA - 2σ。股價觸及上軌可能短線過熱；觸及下軌可能超賣。通道收縮（Squeeze）代表波動率降低，常是大行情前兆。通道擴張代表趨勢加速。",
    tags: ["技術分析", "波動率"],
    links: [
      { label: "Investopedia：Bollinger Bands", url: "https://www.investopedia.com/terms/b/bollingerbands.asp", type: "article" },
    ],
  },
  // --- Fundamental ---
  {
    name: "本益比",
    nameEn: "P/E Ratio (Price-to-Earnings)",
    summary: "股價 / 每股盈餘，反映市場願意為 1 元獲利付多少倍。越低可能越便宜。",
    detail:
      "分為「歷史本益比」(以過去 12 個月 EPS 計算) 和「預估本益比」(以分析師預測 EPS 計算)。P/E 高低需與同產業比較才有意義。成長型股票通常 P/E 偏高，因為市場預期未來獲利大幅成長。P/E < 0 代表公司虧損，此時 P/E 無意義。",
    tags: ["基本面", "估值"],
    links: [
      { label: "Investopedia：P/E Ratio", url: "https://www.investopedia.com/terms/p/price-earningsratio.asp", type: "article" },
      { label: "本益比怎麼看？（市場先生）", url: "https://mrmarket.com.tw/stock/article/pe-ratio/", type: "article" },
    ],
  },
  {
    name: "每股盈餘",
    nameEn: "EPS (Earnings Per Share)",
    summary: "公司每股普通股所賺的淨利，是評估獲利能力最基本的指標。",
    detail:
      "EPS = 稅後淨利 / 流通在外股數。EPS 持續成長代表公司獲利能力提升。要注意「稀釋 EPS」(含選擇權、可轉債的影響) vs「基本 EPS」。單季 EPS 與同期相比的成長率（YoY）更能反映趨勢。",
    tags: ["基本面", "獲利"],
    links: [
      { label: "Investopedia：EPS", url: "https://www.investopedia.com/terms/e/eps.asp", type: "article" },
    ],
  },
  {
    name: "股東權益報酬率",
    nameEn: "ROE (Return on Equity)",
    summary: "公司用股東的錢賺多少錢的比率，越高代表獲利能力越強。",
    detail:
      "ROE = 稅後淨利 / 股東權益。巴菲特認為長期維持 ROE > 15% 的公司才是好企業。可用杜邦分析拆解：ROE = 淨利率 × 資產周轉率 × 財務槓桿，了解驅動 ROE 的來源。高財務槓桿推高的 ROE 需謹慎評估。",
    tags: ["基本面", "獲利"],
    links: [
      { label: "Investopedia：ROE", url: "https://www.investopedia.com/terms/r/returnonequity.asp", type: "article" },
    ],
  },
  {
    name: "毛利率",
    nameEn: "Gross Margin",
    summary: "收入扣掉直接成本後的比率，反映產品本身的競爭力與定價能力。",
    detail:
      "毛利率 = (營收 - 銷貨成本) / 營收。高毛利率（如軟體業 70%+）代表產品有定價優勢；低毛利率（如代工業）代表競爭激烈、需靠量取勝。毛利率長期趨勢比單一數字更重要——持續下滑可能代表競爭加劇或成本上升。",
    tags: ["基本面", "獲利"],
    links: [
      { label: "Investopedia：Gross Profit Margin", url: "https://www.investopedia.com/terms/g/gross_profit_margin.asp", type: "article" },
    ],
  },
  {
    name: "負債比率",
    nameEn: "Debt Ratio",
    summary: "總負債 / 總資產，比率越低代表財務結構越健康、償債能力越強。",
    detail:
      "一般而言，負債比率 < 50% 被視為較健康。但不同產業標準差異大：銀行業因業務性質負債比率天然偏高；科技業則通常較低。需與流動比率（流動資產/流動負債）一起看，才能全面評估短期償債能力。",
    tags: ["基本面", "財務健康"],
    links: [
      { label: "Investopedia：Debt Ratio", url: "https://www.investopedia.com/terms/d/debtratio.asp", type: "article" },
    ],
  },
  // --- Market Concepts ---
  {
    name: "法人持股",
    nameEn: "Institutional Holdings",
    summary: "外資、投信、自營商等大型機構投資人的持股比率與買賣動向。",
    detail:
      "台股三大法人：外資（外國機構）、投信（國內基金）、自營商（券商自有資金）。法人持股比率高通常代表機構認可該公司；但也要注意法人集中賣出時的壓力。法人連續買超往往是強勢訊號，但追高需注意籌碼面風險。",
    tags: ["籌碼", "台股"],
    links: [
      { label: "Investopedia：Institutional Investor", url: "https://www.investopedia.com/terms/i/institutionalinvestor.asp", type: "article" },
    ],
  },
  {
    name: "成交量",
    nameEn: "Volume",
    summary: "某段時間內的交易股數或金額，是判斷行情真假的重要輔助指標。",
    detail:
      "量價關係：「價漲量增」代表多頭動能強；「價漲量縮」可能是漲勢趨緩；「價跌量增」代表空頭動能強。成交量突破 20 日均量 2 倍以上稱為「爆量」，常見於重大消息發布後，需判斷方向。無量空漲或無量下跌需謹慎。",
    tags: ["技術分析", "籌碼"],
    links: [
      { label: "Investopedia：Volume", url: "https://www.investopedia.com/terms/v/volume.asp", type: "article" },
    ],
  },
];

const RESOURCES: Resource[] = [
  {
    title: "市場先生 Mr. Market",
    description: "台灣最完整的投資理財知識庫，從新手到進階皆有系統化教學。",
    url: "https://mrmarket.com.tw",
    type: "site",
    language: "zh",
    tags: ["綜合", "台股", "基本面"],
  },
  {
    title: "股感知識庫",
    description: "以視覺化方式解說財經知識，適合初學者入門。",
    url: "https://www.stockfeel.com.tw",
    type: "site",
    language: "zh",
    tags: ["綜合", "入門"],
  },
  {
    title: "Investopedia",
    description: "全球最大的金融教育網站，涵蓋所有投資術語與概念的詳細解說。",
    url: "https://www.investopedia.com",
    type: "site",
    language: "en",
    tags: ["綜合", "術語", "基本面", "技術分析"],
  },
  {
    title: "Investopedia：技術分析完整指南",
    description: "從移動平均線到動量指標的全面技術分析教程。",
    url: "https://www.investopedia.com/technical-analysis-4689657",
    type: "article",
    language: "en",
    tags: ["技術分析"],
  },
  {
    title: "Investopedia：基本面分析完整指南",
    description: "如何閱讀財報、計算估值指標、評估公司內在價值。",
    url: "https://www.investopedia.com/fundamental-analysis-4689757",
    type: "article",
    language: "en",
    tags: ["基本面"],
  },
  {
    title: "YouTube：小Lin說（財經知識）",
    description: "以生動有趣的方式解說財經時事與投資概念，適合中文用戶。",
    url: "https://www.youtube.com/@xiaoLinsaid",
    type: "video",
    language: "zh",
    tags: ["綜合", "入門", "時事"],
  },
  {
    title: "YouTube：Ben Felix（循證投資）",
    description: "基於學術研究的投資策略分析，深度討論因子投資、市場效率等話題。",
    url: "https://www.youtube.com/@BenFelixCSI",
    type: "video",
    language: "en",
    tags: ["策略", "指數投資"],
  },
  {
    title: "YouTube：Patrick Boyle（金融市場）",
    description: "前對沖基金經理人深度解析金融市場、衍生品與宏觀經濟。",
    url: "https://www.youtube.com/@PBoyle",
    type: "video",
    language: "en",
    tags: ["進階", "宏觀"],
  },
];

const ALL_TAGS = ["全部", "技術分析", "基本面", "動能", "波動率", "估值", "獲利", "財務健康", "籌碼", "台股"];

function TermCard({ term }: { term: Term }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="border border-border rounded-lg overflow-hidden cursor-pointer hover:border-primary/50 transition-colors"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center justify-between p-4 bg-muted/30">
        <div>
          <span className="font-semibold text-foreground">{term.name}</span>
          <span className="text-muted-foreground text-xs ml-2">({term.nameEn})</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex gap-1">
            {term.tags.map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs px-2 py-0">
                {tag}
              </Badge>
            ))}
          </div>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>
      {!expanded && (
        <p className="px-4 py-2 text-xs text-muted-foreground">{term.summary}</p>
      )}
      {expanded && (
        <div className="p-4 space-y-3 border-t border-border">
          <p className="text-sm text-foreground leading-relaxed">{term.detail}</p>
          {term.links.length > 0 && (
            <div className="pt-2 border-t border-border">
              <p className="text-xs font-medium text-muted-foreground mb-2">延伸閱讀</p>
              <div className="space-y-1">
                {term.links.map((link, i) => (
                  <a
                    key={i}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-xs text-blue-400 hover:text-blue-300 hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {link.type === "video" ? <Youtube className="h-3 w-3" /> : <BookOpen className="h-3 w-3" />}
                    {link.label}
                    <ExternalLink className="h-2.5 w-2.5 opacity-50" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ResourceCard({ resource }: { resource: Resource }) {
  const icon = resource.type === "video" ? "🎬" : resource.type === "site" ? "🌐" : "📄";
  return (
    <a
      href={resource.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block border border-border rounded-lg p-4 hover:border-primary/50 hover:bg-muted/30 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span>{icon}</span>
            <span className="font-medium text-sm text-foreground truncate">{resource.title}</span>
            <Badge variant="outline" className="text-xs px-1.5 py-0 flex-shrink-0">
              {resource.language === "zh" ? "中文" : "EN"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{resource.description}</p>
          <div className="flex gap-1 mt-2 flex-wrap">
            {resource.tags.map((tag) => (
              <span key={tag} className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                {tag}
              </span>
            ))}
          </div>
        </div>
        <ExternalLink className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
      </div>
    </a>
  );
}

export function LearningCenter() {
  const [activeTag, setActiveTag] = useState("全部");
  const [resourceTag, setResourceTag] = useState("全部");

  const filteredTerms =
    activeTag === "全部" ? TERMS : TERMS.filter((t) => t.tags.includes(activeTag));

  const resourceTags = ["全部", "技術分析", "基本面", "綜合", "策略", "台股", "入門", "進階"];
  const filteredResources =
    resourceTag === "全部" ? RESOURCES : RESOURCES.filter((r) => r.tags.includes(resourceTag));

  return (
    <div className="space-y-6">
      {/* Glossary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            金融術語字典
          </CardTitle>
          <p className="text-sm text-muted-foreground">點擊任一術語查看詳細說明與推薦資源</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Tag filter */}
          <div className="flex flex-wrap gap-2">
            {ALL_TAGS.map((tag) => (
              <button
                key={tag}
                onClick={() => setActiveTag(tag)}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                  activeTag === tag
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
          {/* Terms */}
          <div className="space-y-2">
            {filteredTerms.map((term) => (
              <TermCard key={term.name} term={term} />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Resources */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Youtube className="h-5 w-5 text-red-500" />
            推薦學習資源
          </CardTitle>
          <p className="text-sm text-muted-foreground">精選文章、影片與網站，持續精進投資知識</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Tag filter */}
          <div className="flex flex-wrap gap-2">
            {resourceTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setResourceTag(tag)}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                  resourceTag === tag
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
          {/* Resources grid */}
          <div className="grid gap-3 md:grid-cols-2">
            {filteredResources.map((resource) => (
              <ResourceCard key={resource.url} resource={resource} />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
