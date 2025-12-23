import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { headers } from "next/headers";

async function getMoneyTruth(shopId: string) {
  const [commissionsPaid, commissionsPending, withdrawalsPending] =
    await Promise.all([
      prisma.commission.aggregate({
        where: {
          shopId,
          status: "PAID",
        },
        _sum: {
          netRevenue: true,
        },
      }),

      prisma.commission.aggregate({
        where: {
          shopId,
          status: "PENDING",
        },
        _sum: {
          netRevenue: true,
        },
      }),

      prisma.withdrawal.aggregate({
        where: {
          shopId,
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
  const availableBalance = Math.max(0, totalCommissionsPaid - totalWithdrawalsPending);

  return {
    totalCommissionsPaid,
    totalCommissionsPending,
    totalWithdrawalsPending,
    availableBalance,
  };
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export default async function DashboardPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return <div>Unauthorized</div>;
  }

  const shop = await prisma.shop.findUnique({
    where: { userId: session.user.id },
  });

  if (!shop) {
    return <div>Shop not found</div>;
  }

  const moneyTruth = await getMoneyTruth(shop.id);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Money Truth</h1>
        <p className="text-muted-foreground mt-2">
          La source de vérité financière de votre shop
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Commissions Payées
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(moneyTruth.totalCommissionsPaid)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Total des commissions reçues
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Commissions En Attente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {formatCurrency(moneyTruth.totalCommissionsPending)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              En attente de paiement
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Retraits En Attente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {formatCurrency(moneyTruth.totalWithdrawalsPending)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Demandes de retrait en cours
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Solde Disponible
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {formatCurrency(moneyTruth.availableBalance)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Montant disponible pour retrait
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Formule de Calcul</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <p>
              <strong>Solde Disponible</strong> = Commissions Payées - Retraits
              En Attente
            </p>
            <p className="text-muted-foreground">
              {formatCurrency(moneyTruth.totalCommissionsPaid)} -{" "}
              {formatCurrency(moneyTruth.totalWithdrawalsPending)} ={" "}
              {formatCurrency(moneyTruth.availableBalance)}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
