import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET /api/tw-coverage?ticker=2330
// GET /api/tw-coverage?sector=Semiconductors
// GET /api/tw-coverage?q=台積電  (name search)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get('ticker');
    const sector = searchParams.get('sector');
    const q = searchParams.get('q');

    if (ticker) {
      const report = await prisma.stockReport.findUnique({
        where: { ticker },
      });
      if (!report) {
        return NextResponse.json({ error: 'Report not found' }, { status: 404 });
      }
      return NextResponse.json(report);
    }

    if (sector) {
      const reports = await prisma.stockReport.findMany({
        where: { sector },
        select: { ticker: true, name: true, sector: true, updatedAt: true },
        orderBy: { ticker: 'asc' },
      });
      return NextResponse.json(reports);
    }

    if (q) {
      const reports = await prisma.stockReport.findMany({
        where: {
          OR: [
            { name: { contains: q } },
            { ticker: { contains: q } },
          ],
        },
        select: { ticker: true, name: true, sector: true, updatedAt: true },
        take: 20,
      });
      return NextResponse.json(reports);
    }

    // Return summary stats if no params
    const [total, sectors] = await Promise.all([
      prisma.stockReport.count(),
      prisma.stockReport.groupBy({
        by: ['sector'],
        _count: { ticker: true },
        orderBy: { _count: { ticker: 'desc' } },
      }),
    ]);

    return NextResponse.json({
      total,
      sectors: sectors.map((s) => ({ name: s.sector, count: s._count.ticker })),
    });
  } catch (error) {
    console.error('TW Coverage API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
