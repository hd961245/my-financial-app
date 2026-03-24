import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getQuote } from '@/lib/yahoo-finance';
import { verifyCronSecret } from '@/lib/cron-auth';
import { sendDiscordWebhook } from '@/lib/discord-bot';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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
        for (const r of quotes) {
            if (r.status === 'fulfilled' && r.value.price != null) {
                priceMap.set(r.value.sym, r.value.price);
            }
        }

        const now = new Date();
        const triggeredIds: number[] = [];
        const triggeredDetails: { id: number; symbol: string; name: string; condition: string; targetPrice: number; currentPrice: number }[] = [];

        for (const alert of activeAlerts) {
            const currentPrice = priceMap.get(alert.symbol);
            if (currentPrice == null) continue;
            const isTriggered =
                (alert.condition === 'ABOVE' && currentPrice >= alert.targetPrice) ||
                (alert.condition === 'BELOW' && currentPrice <= alert.targetPrice);
            if (isTriggered) {
                triggeredIds.push(alert.id);
                triggeredDetails.push({ id: alert.id, symbol: alert.symbol, name: alert.name, condition: alert.condition, targetPrice: alert.targetPrice, currentPrice });
            }
        }

        // Batch update all triggered alerts at once
        if (triggeredIds.length > 0) {
            await prisma.priceAlert.updateMany({
                where: { id: { in: triggeredIds } },
                data: { isActive: false, triggeredAt: now },
            });

            const ts = now.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
            const lines = triggeredDetails.map(t =>
                `🔔 **${t.name} (${t.symbol})** 已${t.condition === 'ABOVE' ? '突破' : '跌破'} $${t.targetPrice}（現價 $${t.currentPrice.toFixed(2)}）`
            );
            await sendDiscordWebhook(`⚠️ **價格到價提醒** (${ts})\n\n${lines.join('\n')}`);
        }

        return NextResponse.json({ checked: activeAlerts.length, triggered: triggeredDetails.length, details: triggeredDetails });
    } catch (error: any) {
        console.error('Price alert cron error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
