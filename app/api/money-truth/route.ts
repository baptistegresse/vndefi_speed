import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    // Récupérer la session depuis les headers de la requête
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Récupérer le shop de l'utilisateur
    const shop = await prisma.shop.findUnique({
      where: { userId: session.user.id },
    });

    if (!shop) {
      return NextResponse.json(
        { error: "Shop not found" },
        { status: 404 }
      );
    }

    // Calculer les totaux en parallèle
    const [commissionsPaid, commissionsPending, withdrawalsPending] =
      await Promise.all([
        // Total commissions PAID
        prisma.commission.aggregate({
          where: {
            shopId: shop.id,
            status: "PAID",
          },
          _sum: {
            netRevenue: true,
          },
        }),

        // Total commissions PENDING
        prisma.commission.aggregate({
          where: {
            shopId: shop.id,
            status: "PENDING",
          },
          _sum: {
            netRevenue: true,
          },
        }),

        // Total withdrawals PENDING
        prisma.withdrawal.aggregate({
          where: {
            shopId: shop.id,
            status: "PENDING",
          },
          _sum: {
            requestedAmount: true,
          },
        }),
      ]);

    const totalCommissionsPaid = commissionsPaid._sum.netRevenue ?? 0;
    const totalCommissionsPending = commissionsPending._sum.netRevenue ?? 0;
    const totalWithdrawalsPending = withdrawalsPending._sum.requestedAmount ?? 0;

    // Available balance = Total commissions PAID - Total withdrawals PENDING
    // (on ne soustrait pas les withdrawals PAID car ils sont déjà déduits du disponible)
    const availableBalance = totalCommissionsPaid - totalWithdrawalsPending;

    return NextResponse.json({
      totalCommissionsPaid,
      totalCommissionsPending,
      totalWithdrawalsPending,
      availableBalance: Math.max(0, availableBalance), // Ne peut pas être négatif
      shopId: shop.id,
      shopName: shop.name,
    });
  } catch (error) {
    console.error("Error fetching money truth:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

