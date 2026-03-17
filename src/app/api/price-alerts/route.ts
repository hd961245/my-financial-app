import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    const alerts = await prisma.priceAlert.findMany({
        orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    });
    return NextResponse.json(alerts);
}

export async function POST(request: Request) {
    try {
        const { symbol, name, targetPrice, condition } = await request.json();

        if (!symbol || !targetPrice || !condition) {
            return NextResponse.json({ error: '缺少必要欄位' }, { status: 400 });
        }
        if (!['ABOVE', 'BELOW'].includes(condition)) {
            return NextResponse.json({ error: 'condition 必須是 ABOVE 或 BELOW' }, { status: 400 });
        }

        const alert = await prisma.priceAlert.create({
            data: {
                symbol: symbol.toUpperCase(),
                name: name || symbol,
                targetPrice: parseFloat(targetPrice),
                condition,
            },
        });
        return NextResponse.json(alert, { status: 201 });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });

        await prisma.priceAlert.delete({ where: { id: parseInt(id) } });
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PATCH(request: Request) {
    try {
        const { id, isActive } = await request.json();
        if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });

        const alert = await prisma.priceAlert.update({
            where: { id },
            data: { isActive, triggeredAt: isActive ? null : undefined },
        });
        return NextResponse.json(alert);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
