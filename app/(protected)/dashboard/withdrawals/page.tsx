import { Suspense } from "react";
import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { headers } from "next/headers";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function getStatusLabel(status: string): string {
  switch (status) {
    case "PAID": return "Paid";
    case "PENDING": return "Pending";
    case "PROCESSING": return "Processing";
    case "FAILED": return "Failed";
    default: return status;
  }
}

function TableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center justify-between py-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

async function WithdrawalsTable({ shopId }: { shopId: string }) {
  const withdrawals = await prisma.withdrawal.findMany({
    where: { shopId },
    orderBy: { createdAt: "desc" },
  });

  if (withdrawals.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-12">
        No withdrawals yet
      </p>
    );
  }

  return (
    <div className="divide-y">
      {withdrawals.map((w) => (
        <div key={w.id} className="flex items-center justify-between py-3">
          <div className="flex items-center gap-3">
            <span className={`h-2 w-2 rounded-full ${
              w.status === "PAID" ? "bg-emerald-500" : 
              w.status === "PENDING" ? "bg-amber-500" : 
              w.status === "PROCESSING" ? "bg-blue-500" : "bg-red-500"
            }`} />
            <span className="text-sm">{formatDate(w.createdAt)}</span>
            <span className="text-xs text-muted-foreground">{getStatusLabel(w.status)}</span>
          </div>
          <span className="text-sm font-medium tabular-nums">
            {formatCurrency(w.requestedAmount)}
          </span>
        </div>
      ))}
    </div>
  );
}

export default async function WithdrawalsPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/account/sign-in");
  }

  const shop = await prisma.shop.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });

  if (!shop) {
    return <div className="p-6">Shop not found</div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/dashboard" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-xl font-semibold">Withdrawals</h1>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Suspense fallback={<TableSkeleton />}>
            <WithdrawalsTable shopId={shop.id} />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
