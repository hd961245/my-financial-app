import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// ─── Badge definitions ────────────────────────────────────────────────────────

export interface Badge {
    id: string;
    emoji: string;
    label: string;
    desc: string;
    tier: 'bronze' | 'silver' | 'gold' | 'diamond';
}

const BADGE_DEFS: (Badge & { check: (s: ModelStats) => boolean })[] = [
    {
        id: 'first_blood',   emoji: '🩸', label: '初試啼聲', tier: 'bronze',
        desc: '完成第 1 筆交易',
        check: s => s.totalTrades >= 1,
    },
    {
        id: 'ten_trades',    emoji: '📊', label: '十戰老兵', tier: 'bronze',
        desc: '完成 10 筆已結算交易',
        check: s => s.totalTrades >= 10,
    },
    {
        id: 'streak3',       emoji: '🔥', label: '連勝三連', tier: 'bronze',
        desc: '連續獲利 3 筆',
        check: s => s.maxWinStreak >= 3,
    },
    {
        id: 'streak5',       emoji: '🔥🔥', label: '五連紅', tier: 'silver',
        desc: '連續獲利 5 筆',
        check: s => s.maxWinStreak >= 5,
    },
    {
        id: 'sniper',        emoji: '🎯', label: '神準狙擊手', tier: 'silver',
        desc: '勝率超過 65%（至少 10 筆）',
        check: s => s.totalTrades >= 10 && (s.wins / s.totalTrades) >= 0.65,
    },
    {
        id: 'big_return',    emoji: '🚀', label: '飆股獵人', tier: 'silver',
        desc: '單筆報酬超過 8%',
        check: s => s.bestReturn >= 8,
    },
    {
        id: 'steady',        emoji: '🛡️', label: '穩健派', tier: 'silver',
        desc: '最大單筆虧損不超過 3%（至少 5 筆）',
        check: s => s.totalTrades >= 5 && s.worstReturn >= -3,
    },
    {
        id: 'streak10',      emoji: '⚡', label: '十連勝', tier: 'gold',
        desc: '連續獲利 10 筆',
        check: s => s.maxWinStreak >= 10,
    },
    {
        id: 'master',        emoji: '💎', label: '交易大師', tier: 'gold',
        desc: '勝率超過 70%（至少 20 筆）',
        check: s => s.totalTrades >= 20 && (s.wins / s.totalTrades) >= 0.70,
    },
    {
        id: 'returns_king',  emoji: '👑', label: '報酬之王', tier: 'gold',
        desc: '累計報酬超過 50%',
        check: s => s.totalReturn >= 50,
    },
    {
        id: 'legend',        emoji: '🌟', label: '傳奇', tier: 'diamond',
        desc: '勝率超過 75%（至少 30 筆）且累計報酬 > 100%',
        check: s => s.totalTrades >= 30 && (s.wins / s.totalTrades) >= 0.75 && s.totalReturn >= 100,
    },
];

// ─── Level thresholds ─────────────────────────────────────────────────────────

const LEVELS = [
    { level: 1, xp: 0,    title: '菜鳥分析師' },
    { level: 2, xp: 50,   title: '助理交易員' },
    { level: 3, xp: 150,  title: '初級分析師' },
    { level: 4, xp: 300,  title: '資深分析師' },
    { level: 5, xp: 600,  title: '投資組合經理' },
    { level: 6, xp: 1000, title: '首席策略師' },
    { level: 7, xp: 1600, title: '量化大師' },
    { level: 8, xp: 2500, title: '市場傳奇' },
];

function computeLevel(xp: number) {
    let current = LEVELS[0];
    for (const l of LEVELS) {
        if (xp >= l.xp) current = l;
        else break;
    }
    const idx = LEVELS.indexOf(current);
    const next = LEVELS[idx + 1] ?? null;
    const progress = next
        ? Math.round(((xp - current.xp) / (next.xp - current.xp)) * 100)
        : 100;
    return { ...current, nextXp: next?.xp ?? null, nextTitle: next?.title ?? null, progress };
}

// ─── Stats type ───────────────────────────────────────────────────────────────

interface ModelStats {
    totalTrades: number;
    wins: number;
    totalReturn: number;
    bestReturn: number;
    worstReturn: number;
    maxWinStreak: number;
    currentStreak: number;     // positive = win streak, negative = loss streak
    currentStreakType: 'win' | 'loss' | 'none';
    xp: number;
    recentResults: ('win' | 'loss')[];  // last 10
}

function computeStats(recs: { returnPct: number | null; isWin: boolean | null; closedAt: Date | null }[]): ModelStats {
    // Sort by closedAt ascending
    const sorted = [...recs]
        .filter(r => r.closedAt != null && r.returnPct != null)
        .sort((a, b) => a.closedAt!.getTime() - b.closedAt!.getTime());

    let wins = 0;
    let totalReturn = 0;
    let bestReturn = -Infinity;
    let worstReturn = Infinity;
    let xp = 0;
    let maxWinStreak = 0;
    let currentWinRun = 0;
    const recentResults: ('win' | 'loss')[] = [];

    for (const r of sorted) {
        const ret = r.returnPct ?? 0;
        const isWin = r.isWin ?? ret > 0;
        totalReturn += ret;
        if (ret > bestReturn) bestReturn = ret;
        if (ret < worstReturn) worstReturn = ret;
        if (isWin) {
            wins++;
            xp += 15 + Math.max(0, Math.floor(ret));  // bonus XP for big returns
            currentWinRun++;
            if (currentWinRun > maxWinStreak) maxWinStreak = currentWinRun;
        } else {
            xp += 5;  // participation XP
            currentWinRun = 0;
        }
        recentResults.push(isWin ? 'win' : 'loss');
    }

    // Current streak (from the end)
    let currentStreak = 0;
    let currentStreakType: 'win' | 'loss' | 'none' = 'none';
    if (sorted.length > 0) {
        const lastIsWin = sorted[sorted.length - 1].isWin ?? false;
        currentStreakType = lastIsWin ? 'win' : 'loss';
        for (let i = sorted.length - 1; i >= 0; i--) {
            const w = sorted[i].isWin ?? false;
            if (w === lastIsWin) currentStreak++;
            else break;
        }
    }

    return {
        totalTrades: sorted.length,
        wins,
        totalReturn,
        bestReturn: bestReturn === -Infinity ? 0 : bestReturn,
        worstReturn: worstReturn === Infinity ? 0 : worstReturn,
        maxWinStreak,
        currentStreak,
        currentStreakType,
        xp,
        recentResults: recentResults.slice(-10),
    };
}

// ─── GET /api/ai-trading/gamestats ───────────────────────────────────────────

const MODELS = ['claude', 'openai', 'gemini'] as const;
type Model = typeof MODELS[number];

export async function GET() {
    try {
        const allClosed = await prisma.aITradingRec.findMany({
            where: { closedAt: { not: null } },
            select: { aiModel: true, returnPct: true, isWin: true, closedAt: true },
            orderBy: { closedAt: 'asc' },
        });

        // Single pass: bucket records by model and collect month stats simultaneously
        const monthStart = new Date();
        monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

        const byModel: Record<Model, typeof allClosed> = { claude: [], openai: [], gemini: [] };
        const monthByModel: Record<Model, { total: number; wins: number }> = {
            claude: { total: 0, wins: 0 }, openai: { total: 0, wins: 0 }, gemini: { total: 0, wins: 0 },
        };

        for (const r of allClosed) {
            const m = r.aiModel as Model;
            if (!byModel[m]) continue;
            byModel[m].push(r);
            if (r.closedAt! >= monthStart && r.returnPct != null) {
                monthByModel[m].total++;
                if (r.isWin) monthByModel[m].wins++;
            }
        }

        const monthChampion = MODELS
            .filter(m => monthByModel[m].total >= 3)
            .sort((a, b) => (monthByModel[b].wins / monthByModel[b].total) - (monthByModel[a].wins / monthByModel[a].total))[0] ?? null;

        const result: Record<string, any> = {};
        for (const model of MODELS) {
            const stats = computeStats(byModel[model]);
            const levelInfo = computeLevel(stats.xp);
            const earned = BADGE_DEFS.filter(b => b.check(stats)).map(({ check: _c, ...b }) => b);
            if (monthChampion === model && stats.totalTrades >= 3) {
                earned.push({ id: 'month_champ', emoji: '🥇', label: '本月冠軍', desc: '本月勝率最高', tier: 'gold' as const });
            }
            result[model] = {
                ...stats,
                levelInfo,
                badges: earned,
                winRate: stats.totalTrades > 0 ? (stats.wins / stats.totalTrades) * 100 : 0,
            };
        }

        return NextResponse.json(result);
    } catch (error: any) {
        console.error('Gamestats Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
