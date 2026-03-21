import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const DEFAULT_CONFIG = {
    claude_enabled: true,
    openai_enabled: true,
    gemini_enabled: true,
    stocks: ['2330.TW', '2454.TW', '2317.TW', 'AAPL', 'NVDA', 'TSLA'],
    min_confidence: 60,
    close_days: 5,
    auto_paper_trade: false,
    auto_paper_min_confidence: 80,
};

export async function GET() {
    const row = await prisma.systemSetting.findUnique({ where: { key: 'ai_trading_config' } });
    if (!row) return NextResponse.json(DEFAULT_CONFIG);
    try {
        return NextResponse.json({ ...DEFAULT_CONFIG, ...JSON.parse(row.value) });
    } catch {
        return NextResponse.json(DEFAULT_CONFIG);
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const merged = { ...DEFAULT_CONFIG, ...body };
        await prisma.systemSetting.upsert({
            where: { key: 'ai_trading_config' },
            create: { key: 'ai_trading_config', value: JSON.stringify(merged) },
            update: { value: JSON.stringify(merged) },
        });
        return NextResponse.json({ success: true, config: merged });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
