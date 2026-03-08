import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const categories = await prisma.portfolioCategory.findMany({
            orderBy: { createdAt: 'asc' }
        });
        return NextResponse.json(categories);
    } catch (error) {
        console.error('Failed to get categories:', error);
        return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { name } = body;

        if (!name) {
            return NextResponse.json({ error: 'Name is required' }, { status: 400 });
        }

        const newCategory = await prisma.portfolioCategory.create({
            data: { name }
        });

        return NextResponse.json(newCategory);
    } catch (error) {
        console.error('Failed to create category:', error);
        return NextResponse.json({ error: 'Failed to create category' }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'ID is required' }, { status: 400 });
        }

        // Unlink any trades that were in this category to prevent errors
        await prisma.trade.updateMany({
            where: { categoryId: id },
            data: { categoryId: null }
        });

        await prisma.portfolioCategory.delete({
            where: { id }
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Failed to delete category:', error);
        return NextResponse.json({ error: 'Failed to delete category' }, { status: 500 });
    }
}
