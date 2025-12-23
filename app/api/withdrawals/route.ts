import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import type { PaymentType } from "@/app/generated/prisma/client";
import { NextResponse } from "next/server";

type CreateWithdrawalPayload = {
  amount: number;
  paymentType: PaymentType;
  destinationAddress?: string;
};

function parsePaymentType(raw: unknown): PaymentType {
  if (raw === "CRYPTO" || raw === "FIAT") {
    return raw;
  }
  throw new Error('paymentType must be "CRYPTO" or "FIAT"');
}

async function getShopForSession(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const shop = await prisma.shop.findUnique({
    where: { userId: session.user.id },
  });

  if (!shop) {
    return { error: NextResponse.json({ error: "Shop not found" }, { status: 404 }) };
  }

  return { shop };
}

async function computeAvailableBalance(shopId: string): Promise<{
  availableBalance: number;
}> {
  const now = new Date();
  const [commissionsAvailable, withdrawalsPending] = await Promise.all([
    prisma.commission.aggregate({
      where: {
        shopId,
        status: "PAID",
        OR: [{ availableAt: null }, { availableAt: { lte: now } }],
      },
      _sum: { netRevenue: true },
    }),
    prisma.withdrawal.aggregate({
      where: { shopId, status: "PENDING" },
      _sum: { requestedAmount: true },
    }),
  ]);

  const totalCommissionsAvailable = commissionsAvailable._sum.netRevenue ?? 0;
  const totalWithdrawalsPending = withdrawalsPending._sum.requestedAmount ?? 0;
  const availableBalance = totalCommissionsAvailable - totalWithdrawalsPending;

  return { availableBalance: Math.max(0, availableBalance) };
}

export async function GET(request: Request) {
  const result = await getShopForSession(request);
  if ("error" in result) {
    return result.error;
  }

  const withdrawals = await prisma.withdrawal.findMany({
    where: { shopId: result.shop.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ withdrawals });
}

export async function POST(request: Request) {
  try {
    const result = await getShopForSession(request);
    if ("error" in result) {
      return result.error;
    }

    const body = (await request.json()) as Partial<CreateWithdrawalPayload>;

    if (typeof body.amount !== "number" || Number.isNaN(body.amount) || body.amount <= 0) {
      return NextResponse.json(
        { error: "amount must be a positive number" },
        { status: 400 }
      );
    }

    let paymentType: PaymentType;
    try {
      paymentType = parsePaymentType(body.paymentType);
    } catch (error) {
      return NextResponse.json(
        { error: (error as Error).message },
        { status: 400 }
      );
    }

    const destinationAddress =
      typeof body.destinationAddress === "string" && body.destinationAddress.trim() !== ""
        ? body.destinationAddress.trim()
        : undefined;

    const { availableBalance } = await computeAvailableBalance(result.shop.id);

    if (body.amount > availableBalance) {
      return NextResponse.json(
        { error: "Insufficient available balance" },
        { status: 400 }
      );
    }

    const withdrawal = await prisma.withdrawal.create({
      data: {
        shopId: result.shop.id,
        requestedAmount: body.amount,
        paymentType,
        destinationAddress: destinationAddress ?? null,
        status: "PENDING",
      },
    });

    const updatedBalance = availableBalance - body.amount;

    return NextResponse.json(
      {
        ok: true,
        withdrawalId: withdrawal.id,
        status: withdrawal.status,
        availableBalance: updatedBalance,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[Withdrawals] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

