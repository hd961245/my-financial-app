import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const spreadsheetId = searchParams.get('sheetId');

        if (!spreadsheetId) {
            return NextResponse.json({ error: 'Missing Google Sheet ID' }, { status: 400 });
        }

        // To avoid the "API Key Required" error for public sheets, we can 
        // use Google Sheets' built-in CSV export endpoint directly.
        // It works for any sheet where "Anyone with the link can view" is enabled.
        let csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv`;

        // If the user provided a "Publish to the web" link, the ID starts with 'e/'
        // The export URL format is slightly different.
        if (spreadsheetId.startsWith('e/')) {
            csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/pub?output=csv`;
        }

        const response = await fetch(csvUrl);
        if (!response.ok) {
            if (response.status === 404) {
                return NextResponse.json({ error: '找不到該試算表。請確認網址正確，且權限已經設定為「知道連結的任何人」皆可「檢視」。' }, { status: 404 });
            }
            throw new Error(`Google Sheets responded with status: ${response.status}`);
        }

        const csvText = await response.text();
        if (!csvText) {
            return NextResponse.json([]);
        }

        // Parse CSV text manually
        const rows = parseCSV(csvText);

        if (rows.length === 0) {
            return NextResponse.json([]);
        }

        const headers = rows[0].map(h => h.trim());

        const data = rows.slice(1).map((row, index) => {
            const rowData: Record<string, string | number> = { id: String(index) };
            headers.forEach((header, colIndex) => {
                const cleanHeader = header || `Col${colIndex}`;
                // Keep as string initially, let frontend parse numbers if needed
                rowData[cleanHeader] = row[colIndex] !== undefined ? row[colIndex].trim() : '';
            });
            return rowData;
        });

        return NextResponse.json(data);
    } catch (error: any) {
        console.error('Failed to fetch from Google Sheets:', error);
        return NextResponse.json(
            { error: error?.message || 'Failed to fetch資料。確保您的試算表是最新的並且公開。' },
            { status: 500 }
        );
    }
}

// Simple CSV Parser to handle quotes and commas inside cells
function parseCSV(text: string): string[][] {
    const result: string[][] = [];
    let row: string[] = [];
    let currentCell = '';
    let inQuotes = false;

    // Ensure text ends with a newline to trigger the last row push
    if (!text.endsWith('\n')) text += '\n';

    for (let i = 0; i < text.length; i++) {
        const char = text[i];

        if (inQuotes) {
            if (char === '"') {
                // Check if it's an escaped quote
                if (i < text.length - 1 && text[i + 1] === '"') {
                    currentCell += '"';
                    i++; // skip next quote
                } else {
                    inQuotes = false; // end of quoted string
                }
            } else {
                currentCell += char;
            }
        } else {
            if (char === '"') {
                inQuotes = true;
            } else if (char === ',') {
                row.push(currentCell);
                currentCell = '';
            } else if (char === '\n' || char === '\r') {
                if (char === '\r' && i < text.length - 1 && text[i + 1] === '\n') {
                    i++; // skip \n of \r\n
                }
                row.push(currentCell);
                result.push(row);
                row = [];
                currentCell = '';
            } else {
                currentCell += char;
            }
        }
    }

    // Clean up empty trailing rows caused by extra newlines
    return result.filter(r => r.length > 1 || r[0] !== '');
}
