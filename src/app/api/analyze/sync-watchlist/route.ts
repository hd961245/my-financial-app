import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { fetchGoogleSheetData } from '@/lib/google-sheets';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        // 1. Fetch Global Google Sheet ID
        const setting = await prisma.systemSetting.findUnique({ where: { key: 'GOOGLE_SHEET_ID' } });
        const sheetId = setting?.value;

        if (!sheetId) {
            return NextResponse.json({ error: '尚未設定 Google 試算表連結。請先至首頁設定。' }, { status: 400 });
        }

        // 2. Fetch Google Sheet Data
        const rows = await fetchGoogleSheetData(sheetId);
        if (rows.length === 0) {
            return NextResponse.json({ error: '試算表為空或無法讀取。' }, { status: 400 });
        }

        // 3. Find Symbol Column
        const columns = Object.keys(rows[0]).filter(k => k !== 'id');
        const symbolCol = columns.find(c => c.includes('代號') || c.toLowerCase().includes('symbol')) || columns[0];

        // 4. Extract Symbols from Google Sheets
        const sheetSymbols = rows
            .map(row => String(row[symbolCol]).trim().toUpperCase())
            .filter(sym => sym !== '');

        if (sheetSymbols.length === 0) {
            return NextResponse.json({ error: '試算表中找不到有效的股票代號。' }, { status: 400 });
        }

        // 5. Check Database for Existing Trades
        // Get all unique symbols currently in the user's trading history (both BUY, SELL, WATCH)
        const existingTrades = await prisma.trade.findMany({
            select: { symbol: true }
        });
        const existingSymbolsSet = new Set(existingTrades.map(t => t.symbol.toUpperCase()));

        // 6. Find symbols that are in the sheet but NOT in the database at all
        const newSymbolsToWatch = sheetSymbols.filter(sym => !existingSymbolsSet.has(sym));

        // 7. Prevent crashing if account doesn't exist yet, we still need an accountId for foreign key constraint
        let account = await prisma.account.findFirst();
        if (!account) {
            account = await prisma.account.create({
                data: {
                    name: "我的模擬帳戶",
                    currency: "TWD",
                    balance: 0,
                    totalDeposit: 0,
                }
            });
        }

        // 8. Insert new symbols as WATCH trades
        if (newSymbolsToWatch.length > 0) {
            const batchData = newSymbolsToWatch.map(symbol => ({
                symbol: symbol,
                type: 'WATCH',
                shares: 0,
                price: 0,
                accountId: account!.id
            }));

            await prisma.trade.createMany({
                data: batchData
            });
        }

        return NextResponse.json({
            success: true,
            message: `同步完成。從試算表找出了 ${sheetSymbols.length} 檔股票，其中 ${newSymbolsToWatch.length} 檔為新加入觀察清單。`,
            addedCount: newSymbolsToWatch.length,
            addedSymbols: newSymbolsToWatch
        });

    } catch (error: any) {
        console.error("Watchlist Sync Error:", error);
        return NextResponse.json({ error: error.message || '自動同步觀察清單失敗' }, { status: 500 });
    }
}
