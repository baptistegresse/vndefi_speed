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
    case "FAILED":
      return "destructive";
    default:
      return "outline";
  }
}

function getEventTypeLabel(eventType: string): string {
  switch (eventType) {
    case "CPA":
      return "Activation (CPA)";
    case "DEPOSIT":
      return "Commission dépôt";
    case "REVENUE_SHARE":
      return "Part des revenus";
    default:
      return eventType;
  }
}

function getAvailabilityLabel(commission: {
  status: string;
  availableAt: Date | null;
}): string {
  if (commission.status === "PAID") {
    if (commission.availableAt && commission.availableAt > new Date()) {
      return "En cours de libération";
    }
    return "Disponible";
  }
  if (commission.status === "PENDING") {
    return "Non acquis";
  }
  return "Non disponible";
}

export default async function CommissionsPage() {
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

  const commissions = await prisma.commission.findMany({
    where: {
      shopId: shop.id,
    },
    include: {
      affiliateUser: {
        select: {
          partnerUserId: true,
        },
      },
      invoice: {
        select: {
          id: true,
        },
      },
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
          <h1 className="text-3xl font-bold">Commissions</h1>
          <p className="text-muted-foreground mt-2">
            Détail de toutes les commissions - Traçabilité complète
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {commissions.length} commission{commissions.length > 1 ? "s" : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Montant brut</TableHead>
                <TableHead className="text-right">Part shop</TableHead>
                <TableHead className="text-right">Part plateforme</TableHead>
                <TableHead>Disponibilité</TableHead>
                <TableHead>Référence</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {commissions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    Aucune commission trouvée
                  </TableCell>
                </TableRow>
              ) : (
                commissions.map((commission) => (
                  <TableRow key={commission.id}>
                    <TableCell>{formatDate(commission.createdAt)}</TableCell>
                    <TableCell>
                      {getEventTypeLabel(commission.eventType)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusBadgeVariant(commission.status)}>
                        {commission.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatCurrency(commission.grossRevenue)}
                    </TableCell>
                    <TableCell className="text-right font-medium text-green-600">
                      {formatCurrency(commission.netRevenue)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground text-sm">
                      {formatCurrency(commission.platformRevenue)}
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {getAvailabilityLabel(commission)}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <div className="space-y-1">
                        {commission.invoice && (
                          <div>Invoice: {commission.invoice.id.slice(0, 8)}...</div>
                        )}
                        <div>
                          Affiliate: {commission.affiliateUser.partnerUserId}
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

