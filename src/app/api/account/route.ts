import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Helper to ensure a default PAPER account exists
async function getDefaultAccount() {
    let account = await prisma.account.findFirst();
    if (!account) {
        account = await prisma.account.create({
            data: {
                name: "我的模擬帳戶",
                currency: "TWD",
                accountType: "PAPER",
                balance: 0,
                totalDeposit: 0,
            }
        });
    }
    return account;
}

export async function GET() {
    try {
        const accounts = await prisma.account.findMany({ orderBy: { createdAt: 'asc' } });
        if (accounts.length === 0) {
            const account = await getDefaultAccount();
            return NextResponse.json({ account, accounts: [account] });
        }
        return NextResponse.json({ account: accounts[0], accounts });
    } catch (error) {
        console.error("Failed to fetch account:", error);
        return NextResponse.json({ error: "無法取得帳戶資料" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { action, amount, notes, accountId, name, accountType } = body;

        // Create new account
        if (action === 'create') {
            if (!name) return NextResponse.json({ error: '請提供帳戶名稱' }, { status: 400 });
            const newAccount = await prisma.account.create({
                data: {
                    name: String(name),
                    accountType: accountType === 'REAL' ? 'REAL' : 'PAPER',
                    currency: 'TWD',
                    balance: 0,
                    totalDeposit: 0,
                }
            });
            return NextResponse.json({ account: newAccount });
        }

        // Deposit / Withdraw
        let account = accountId
            ? await prisma.account.findUnique({ where: { id: accountId } })
            : await getDefaultAccount();

        if (!account) return NextResponse.json({ error: '找不到帳戶' }, { status: 404 });

        if (!action || typeof amount !== 'number' || amount <= 0) {
            return NextResponse.json({ error: '請提供有效的操作與金額' }, { status: 400 });
        }

        if (action === 'withdraw' && account.balance < amount) {
            return NextResponse.json({ error: '餘額不足，無法提款' }, { status: 400 });
        }

        const transaction = await prisma.$transaction(async (tx) => {
            const newBalance = action === 'deposit' ? account!.balance + amount : account!.balance - amount;
            const newTotalDeposit = action === 'deposit' ? account!.totalDeposit + amount : account!.totalDeposit;

            const updatedAccount = await tx.account.update({
                where: { id: account!.id },
                data: { balance: newBalance, totalDeposit: newTotalDeposit }
            });

            const t = await tx.accountTransaction.create({
                data: {
                    accountId: account!.id,
                    type: action === 'deposit' ? 'DEPOSIT' : 'WITHDRAWAL',
                    amount: action === 'deposit' ? amount : -amount,
                    notes: notes || (action === 'deposit' ? '入金' : '提款')
                }
            });

            return { account: updatedAccount, transaction: t };
        });

        return NextResponse.json(transaction);

    } catch (error) {
        console.error("Failed to update account:", error);
        return NextResponse.json({ error: "操作失敗" }, { status: 500 });
    }
}
