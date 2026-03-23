import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getQuote } from '@/lib/yahoo-finance';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function verifyCronSecret(request: Request): boolean {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) return true;
    return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(request: Request) {
    if (!verifyCronSecret(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const activeAlerts = await prisma.priceAlert.findMany({ where: { isActive: true } });

        if (activeAlerts.length === 0) {
            return NextResponse.json({ message: '無啟用中的價格提醒', triggered: 0 });
        }

        // Fetch prices for all unique symbols in parallel
        const symbols = [...new Set(activeAlerts.map(a => a.symbol))];
        const quotes = await Promise.allSettled(
            symbols.map(async sym => {
                const q = await getQuote(sym);
                return { sym, price: q?.regularMarketPrice ?? null };
            })
        );
        const priceMap = new Map<string, number>();
        for (const result of quotes) {
            if (result.status === 'fulfilled' && result.value.price != null) {
                priceMap.set(result.value.sym, result.value.price);
            }
        }

        const triggered: { id: number; symbol: string; name: string; condition: string; targetPrice: number; currentPrice: number }[] = [];

        for (const alert of activeAlerts) {
            const currentPrice = priceMap.get(alert.symbol);
            if (currentPrice == null) continue;

            const isTriggered =
                (alert.condition === 'ABOVE' && currentPrice >= alert.targetPrice) ||
                (alert.condition === 'BELOW' && currentPrice <= alert.targetPrice);

            if (isTriggered) {
                await prisma.priceAlert.update({
                    where: { id: alert.id },
                    data: { isActive: false, triggeredAt: new Date() },
                });
                triggered.push({
                    id: alert.id,
                    symbol: alert.symbol,
                    name: alert.name,
                    condition: alert.condition,
                    targetPrice: alert.targetPrice,
                    currentPrice,
                });
            }
        }

        // Send Discord notification if any alerts triggered
        if (triggered.length > 0) {
            const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL;
            if (discordWebhookUrl) {
                const now = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
                const lines = triggered.map(t =>
                    `🔔 **${t.name} (${t.symbol})** 已${t.condition === 'ABOVE' ? '突破' : '跌破'} $${t.targetPrice}（現價 $${t.currentPrice.toFixed(2)}）`
                );
                const msg = `⚠️ **價格到價提醒** (${now})\n\n${lines.join('\n')}`;
                try {
                    await fetch(discordWebhookUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ content: msg.substring(0, 2000) }),
                    });
                } catch (e) {
                    console.warn('Discord webhook failed:', e);
                }
            }
        }

        return NextResponse.json({
            checked: activeAlerts.length,
            triggered: triggered.length,
            details: triggered,
        });
    } catch (error: any) {
        console.error('Price alert cron error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
