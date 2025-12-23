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
    const now = new Date();
    const [commissionsAvailable, commissionsPending, withdrawalsPending, withdrawalsPaid] =
      await Promise.all([
        // Commissions PAID et déjà disponibles (availableAt IS NULL OR <= now)
        prisma.commission.aggregate({
          where: {
            shopId: shop.id,
            status: "PAID",
            OR: [{ availableAt: null }, { availableAt: { lte: now } }],
          },
          _sum: { netRevenue: true },
        }),
        // Commissions PENDING (non acquises)
        prisma.commission.aggregate({
          where: { shopId: shop.id, status: "PENDING" },
          _sum: { netRevenue: true },
        }),
        // Withdrawals en attente
        prisma.withdrawal.aggregate({
          where: { shopId: shop.id, status: "PENDING" },
          _sum: { requestedAmount: true },
        }),
        // Withdrawals déjà payés (pour information)
        prisma.withdrawal.aggregate({
          where: { shopId: shop.id, status: "PAID" },
          _sum: { payoutAmount: true },
        }),
      ]);

    const totalCommissionsAvailable = commissionsAvailable._sum.netRevenue ?? 0;
    const totalCommissionsPending = commissionsPending._sum.netRevenue ?? 0;
    const totalWithdrawalsPending = withdrawalsPending._sum.requestedAmount ?? 0;
    const totalWithdrawalsPaid = withdrawalsPaid._sum.payoutAmount ?? 0;

    // Solde disponible = commissions disponibles - retraits en attente
    const availableBalance = totalCommissionsAvailable - totalWithdrawalsPending;

    return NextResponse.json({
      shopId: shop.id,
      shopName: shop.name,
      currency: "EUR",
      commissionsAvailable: totalCommissionsAvailable,
      commissionsPending: totalCommissionsPending,
      withdrawalsPending: totalWithdrawalsPending,
      withdrawalsPaid: totalWithdrawalsPaid,
      availableBalance: Math.max(0, availableBalance), // Ne peut pas être négatif
    });
  } catch (error) {
    console.error("Error fetching money truth:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

