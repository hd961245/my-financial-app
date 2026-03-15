import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const sources = await prisma.dataSource.findMany({
            orderBy: { createdAt: 'desc' }
        });
        return NextResponse.json(sources);
    } catch (error) {
        console.error('Failed to get data sources:', error);
        return NextResponse.json({ error: 'Failed to fetch data sources' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { name, url, type } = body;

        if (!name || !url || !type) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const newSource = await prisma.dataSource.create({
            data: {
                name,
                url,
                type
            }
        });

        return NextResponse.json(newSource);
    } catch (error) {
        console.error('Failed to create data source:', error);
        return NextResponse.json({ error: 'Failed to create data source' }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'ID is required' }, { status: 400 });
        }

        await prisma.dataSource.delete({
            where: { id }
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Failed to delete data source:', error);
        return NextResponse.json({ error: 'Failed to delete data source' }, { status: 500 });
    }
}
