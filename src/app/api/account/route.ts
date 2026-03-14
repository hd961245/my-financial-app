import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Helper to ensure a default account exists
async function getDefaultAccount() {
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
    return account;
}

export async function GET() {
    try {
        const account = await getDefaultAccount();
        return NextResponse.json({ account });
    } catch (error) {
        console.error("Failed to fetch account:", error);
        return NextResponse.json({ error: "無法取得帳戶資料" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { action, amount, notes } = body;

        let account = await getDefaultAccount();

        if (!action || typeof amount !== 'number' || amount <= 0) {
            return NextResponse.json({ error: '請提供有效的操作與金額' }, { status: 400 });
        }

        if (action === 'withdraw' && account.balance < amount) {
            return NextResponse.json({ error: '餘額不足，無法提款' }, { status: 400 });
        }

        const transaction = await prisma.$transaction(async (tx) => {
            // Update account balance
            const newBalance = action === 'deposit' ? account.balance + amount : account.balance - amount;
            const newTotalDeposit = action === 'deposit' ? account.totalDeposit + amount : account.totalDeposit; // optional: subtract on withdraw?

            const updatedAccount = await tx.account.update({
                where: { id: account.id },
                data: {
                    balance: newBalance,
                    totalDeposit: newTotalDeposit // We only track total money put in historically
                }
            });

            // Log transaction
            const t = await tx.accountTransaction.create({
                data: {
                    accountId: account.id,
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
