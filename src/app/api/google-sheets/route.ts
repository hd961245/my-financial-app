import { NextResponse } from 'next/server';
import { google } from 'googleapis';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const spreadsheetId = searchParams.get('sheetId');

        if (!spreadsheetId) {
            return NextResponse.json({ error: 'Missing Google Sheet ID' }, { status: 400 });
        }

        // Initialize Google Sheets API without authentication.
        // This will ONLY work for public sheets ("Anyone with the link can view") OR if an API key is provided
        // We will pass an API key if available in env, otherwise rely on broad public access (which often fails without key)
        // For best results, user should provide GOOGLE_API_KEY in Zeabur for public sheets
        const sheets = google.sheets({
            version: 'v4',
            auth: process.env.GOOGLE_API_KEY || ''
        });

        // Assuming data is on the first sheet, we can fetch all cells
        // In v4, fetching just the Spreadsheet ID usually requires knowing the sheet name. 
        // A common generic range is 'A:Z' or 'Sheet1!A:Z'. If 'Sheet1' is renamed, it might fail.
        // To be safe, let's first get the spreadsheet metadata to find the first sheet's title.
        let firstSheetTitle = 'Sheet1';
        try {
            const meta = await sheets.spreadsheets.get({ spreadsheetId });
            firstSheetTitle = meta.data.sheets?.[0]?.properties?.title || 'Sheet1';
        } catch (metaErr) {
            console.warn("Could not fetch spreadsheet metadata. Assuming 'Sheet1' or first sheet.", metaErr);
            // Defaulting fallback range
        }

        const range = `${firstSheetTitle}!A:Z`;

        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range,
        });

        const rows = response.data.values;
        if (!rows || rows.length === 0) {
            return NextResponse.json({ data: [] });
        }

        // The first row is the header
        const headers: string[] = rows[0] || [];

        // Map remaining rows to objects based on header indices
        const data = rows.slice(1).map((row: any[], index: number) => {
            const rowData: Record<string, string | number> = { id: String(index) };
            headers.forEach((header, colIndex) => {
                const cleanHeader = typeof header === 'string' ? header.trim() : `Col${colIndex}`;
                rowData[cleanHeader] = row[colIndex] !== undefined ? row[colIndex] : '';
            });
            return rowData;
        });

        return NextResponse.json(data);
    } catch (error: any) {
        console.error('Failed to fetch from Google Sheets:', error);
        return NextResponse.json(
            { error: error?.message || 'Failed to fetch from Google Sheets. Make sure the sheet is public and the ID is correct.' },
            { status: 500 }
        );
    }
}
