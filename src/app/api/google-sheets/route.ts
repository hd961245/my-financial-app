import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { fetchGoogleSheetData } from '@/lib/google-sheets';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        const { sheetId } = await request.json();
        if (!sheetId) {
            return NextResponse.json({ error: 'Missing sheetId' }, { status: 400 });
        }

        await prisma.systemSetting.upsert({
            where: { key: 'GOOGLE_SHEET_ID' },
            update: { value: sheetId },
            create: { key: 'GOOGLE_SHEET_ID', value: sheetId },
        });

        return NextResponse.json({ success: true, sheetId });
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Failed to save setting' }, { status: 500 });
    }
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        let spreadsheetId = searchParams.get('sheetId');

        if (!spreadsheetId) {
            const setting = await prisma.systemSetting.findUnique({ where: { key: 'GOOGLE_SHEET_ID' } });
            spreadsheetId = setting?.value || null;
        }

        if (!spreadsheetId) {
            return NextResponse.json({ error: 'Missing Google Sheet ID' }, { status: 400 });
        }

        const data = await fetchGoogleSheetData(spreadsheetId);
        return NextResponse.json(data);
    } catch (error: any) {
        console.error('Failed to fetch from Google Sheets:', error);
        return NextResponse.json(
            { error: error?.message || 'Failed to fetch資料。確保您的試算表是最新的並且公開。' },
            { status: 500 }
        );
    }
}

