import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET /api/tw-coverage/supply-chain?entity=Apple
// Returns all Taiwan companies that mention [[entity]] in their wikilinks
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const entity = searchParams.get('entity');

    if (!entity) {
      return NextResponse.json({ error: 'entity parameter is required' }, { status: 400 });
    }

    // Case-insensitive search in wikilinks array
    const reports = await prisma.stockReport.findMany({
      where: {
        wikilinks: {
          has: entity,
        },
      },
      select: { ticker: true, name: true, sector: true },
      orderBy: { ticker: 'asc' },
    });

    // Also try partial match if exact match returns nothing
    if (reports.length === 0) {
      const allWithEntity = await prisma.$queryRaw<{ ticker: string; name: string; sector: string }[]>`
        SELECT ticker, name, sector
        FROM "StockReport"
        WHERE EXISTS (
          SELECT 1 FROM unnest(wikilinks) AS wl
          WHERE wl ILIKE ${'%' + entity + '%'}
        )
        ORDER BY ticker ASC
      `;
      return NextResponse.json({ entity, count: allWithEntity.length, companies: allWithEntity });
    }

    return NextResponse.json({ entity, count: reports.length, companies: reports });
  } catch (error) {
    console.error('Supply Chain API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
