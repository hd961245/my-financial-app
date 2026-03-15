import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET: return all net worth snapshots
export async function GET() {
  try {
    const snapshots = await prisma.netWorthSnapshot.findMany({
      orderBy: { date: 'asc' },
      select: { date: true, totalValue: true, currency: true },
    });

    return NextResponse.json(
      snapshots.map(s => ({
        date: s.date.toISOString().split('T')[0],
        totalValue: s.totalValue,
        currency: s.currency,
      }))
    );
  } catch (error) {
    console.error('Failed to fetch net worth:', error);
    return NextResponse.json({ error: '無法取得淨值歷史' }, { status: 500 });
  }
}

// POST: upsert a daily snapshot (called automatically by PortfolioTracker)
export async function POST(req: NextRequest) {
  try {
    const { totalValue, currency } = await req.json();

    if (typeof totalValue !== 'number' || totalValue < 0) {
      return NextResponse.json({ error: '無效的淨值數據' }, { status: 400 });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const snapshot = await prisma.netWorthSnapshot.upsert({
      where: { date: today },
      update: { totalValue, currency: currency || 'TWD' },
      create: { date: today, totalValue, currency: currency || 'TWD' },
    });

    return NextResponse.json({
      date: snapshot.date.toISOString().split('T')[0],
      totalValue: snapshot.totalValue,
    });
  } catch (error) {
    console.error('Failed to save net worth snapshot:', error);
    return NextResponse.json({ error: '無法儲存淨值快照' }, { status: 500 });
  }
}
