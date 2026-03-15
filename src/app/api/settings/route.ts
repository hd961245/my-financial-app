import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    if (!key) {
        return NextResponse.json({ error: 'Missing key parameter' }, { status: 400 });
    }

    try {
        const setting = await prisma.systemSetting.findUnique({ where: { key } });
        return NextResponse.json({ value: setting?.value || null });
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Failed to fetch setting' }, { status: 500 });
    }
}
