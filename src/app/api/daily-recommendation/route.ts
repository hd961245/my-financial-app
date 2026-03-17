import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const dateParam = searchParams.get('date');

        let targetDate = new Date();
        if (dateParam) targetDate = new Date(dateParam);
        targetDate.setHours(0, 0, 0, 0);
        const nextDay = new Date(targetDate.getTime() + 86400000);

        const [recommendations, dailyReport, recentDates] = await Promise.all([
            prisma.dailyRecommendation.findMany({
                where: { date: { gte: targetDate, lt: nextDay } },
                orderBy: [{ isHolding: 'desc' }, { action: 'asc' }],
            }),
            prisma.dailyReport.findFirst({
                where: { date: { gte: targetDate, lt: nextDay } },
            }),
            prisma.dailyReport.findMany({
                select: { date: true },
                orderBy: { date: 'desc' },
                take: 7,
            }),
        ]);

        return NextResponse.json({
            date: targetDate.toISOString(),
            recommendations,
            report: dailyReport
                ? {
                      summary: dailyReport.summary,
                      fullReport: dailyReport.fullReport,
                      spotlight: JSON.parse(dailyReport.spotlight || '[]'),
                  }
                : null,
            availableDates: recentDates.map(d => d.date.toISOString()),
        });
    } catch (error: any) {
        console.error('Fetch Daily Recommendation Error:', error);
        return NextResponse.json({ error: error.message || '無法取得每日推薦' }, { status: 500 });
    }
}
