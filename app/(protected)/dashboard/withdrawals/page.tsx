import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { headers } from "next/headers";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function getStatusBadgeVariant(
  status: string
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "PAID":
      return "default";
    case "PENDING":
      return "secondary";
    case "PROCESSING":
      return "secondary";
    case "FAILED":
      return "destructive";
    default:
      return "outline";
  }
}

function getPaymentTypeLabel(paymentType: string): string {
  switch (paymentType) {
    case "CRYPTO":
      return "Crypto";
    case "FIAT":
      return "Fiat";
    default:
      return paymentType;
  }
}

export default async function WithdrawalsPage() {
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

  const withdrawals = await prisma.withdrawal.findMany({
    where: {
      shopId: shop.id,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="icon">
          <Link href="/dashboard">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Retraits</h1>
          <p className="text-muted-foreground mt-2">
            Détail de tous les retraits - Traçabilité complète
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {withdrawals.length} retrait{withdrawals.length > 1 ? "s" : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Montant demandé</TableHead>
                <TableHead className="text-right">Montant reçu</TableHead>
                <TableHead className="text-right">Frais</TableHead>
                <TableHead>Référence</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {withdrawals.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    Aucun retrait trouvé
                  </TableCell>
                </TableRow>
              ) : (
                withdrawals.map((withdrawal) => {
                  const receivedAmount = withdrawal.payoutAmount ?? withdrawal.requestedAmount;
                  const fees = withdrawal.requestedAmount - receivedAmount;

                  return (
                    <TableRow key={withdrawal.id}>
                      <TableCell>{formatDate(withdrawal.createdAt)}</TableCell>
                      <TableCell>
                        {getPaymentTypeLabel(withdrawal.paymentType)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadgeVariant(withdrawal.status)}>
                          {withdrawal.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(withdrawal.requestedAmount)}
                      </TableCell>
                      <TableCell className="text-right font-medium text-green-600">
                        {withdrawal.payoutAmount
                          ? formatCurrency(withdrawal.payoutAmount)
                          : "-"}
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {fees > 0 ? (
                          <span className="text-orange-600">
                            {formatCurrency(fees)}
                          </span>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        <div className="space-y-1">
                          <div>ID: {withdrawal.id.slice(0, 8)}...</div>
                          {withdrawal.transactionHash && (
                            <div className="font-mono text-xs">
                              TX: {withdrawal.transactionHash.slice(0, 16)}...
                            </div>
                          )}
                          {withdrawal.destinationAddress && (
                            <div className="font-mono text-xs">
                              {withdrawal.destinationAddress.slice(0, 20)}...
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

