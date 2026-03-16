import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const dateParam = searchParams.get('date');

        // Default to today
        let targetDate = new Date();
        if (dateParam) {
            targetDate = new Date(dateParam);
        }
        targetDate.setHours(0, 0, 0, 0);
        const nextDay = new Date(targetDate.getTime() + 86400000);

        // Fetch recommendations for the target date
        const recommendations = await prisma.dailyRecommendation.findMany({
            where: {
                date: {
                    gte: targetDate,
                    lt: nextDay,
                },
            },
            orderBy: [
                { isHolding: 'desc' }, // Holdings first
                { action: 'asc' },
            ],
        });

        // Also fetch the last 7 days of recommendation dates for navigation
        const recentDates = await prisma.dailyRecommendation.findMany({
            select: { date: true },
            distinct: ['date'],
            orderBy: { date: 'desc' },
            take: 7,
        });

        return NextResponse.json({
            date: targetDate.toISOString(),
            recommendations,
            availableDates: recentDates.map(d => d.date.toISOString()),
        });
    } catch (error: any) {
        console.error('Fetch Daily Recommendation Error:', error);
        return NextResponse.json({ error: error.message || '無法取得每日推薦' }, { status: 500 });
    }
}
