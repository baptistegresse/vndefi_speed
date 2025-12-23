import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, HelpCircle, Mail, Wallet } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { CopyButton } from "./_components/copy-button";
import { WithdrawalSheet } from "./_components/withdrawal-sheet";

interface ShopData {
  id: string;
  name: string;
  address: string;
  ownerName: string | null;
}

async function getShopData(userId: string): Promise<ShopData | null> {
  const shop = await prisma.shop.findUnique({
    where: { userId },
    select: { id: true, name: true, address: true, user: { select: { name: true } } },
  });
  if (!shop) return null;
  return {
    id: shop.id,
    name: shop.name,
    address: shop.address,
    ownerName: shop.user?.name ?? null,
  };
}

async function getFinancialData(shopId: string) {
  const now = new Date();

  const [paidCommissions, pendingCommissions, pendingWithdrawals, recentCommissions] =
    await Promise.all([
      prisma.commission.aggregate({
        where: {
          shopId,
          status: "PAID",
          OR: [{ availableAt: null }, { availableAt: { lte: now } }],
        },
        _sum: { netRevenue: true },
      }),
      prisma.commission.aggregate({
        where: { shopId, status: "PENDING" },
        _sum: { netRevenue: true },
      }),
      prisma.withdrawal.aggregate({
        where: { shopId, status: "PENDING" },
        _sum: { requestedAmount: true },
      }),
      prisma.commission.findMany({
        where: { shopId },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, netRevenue: true, status: true, createdAt: true },
      }),
    ]);

  const totalPaid = paidCommissions._sum.netRevenue ?? 0;
  const totalPending = pendingCommissions._sum.netRevenue ?? 0;
  const totalWithdrawals = pendingWithdrawals._sum.requestedAmount ?? 0;
  const available = Math.max(0, totalPaid - totalWithdrawals);

  return { totalPaid, totalPending, available, recentCommissions };
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
  }).format(date);
}

function BalanceSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <Skeleton className="h-4 w-32" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-10 w-40 mb-4" />
        <Skeleton className="h-10 w-full" />
      </CardContent>
    </Card>
  );
}

function ActivitySkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-24" />
      </CardHeader>
      <CardContent className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex justify-between">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

interface BalanceCardProps {
  shopId: string;
  shopAddress: string;
  ownerName: string | null;
}

async function BalanceCard({ shopId, shopAddress, ownerName }: BalanceCardProps) {
  const data = await getFinancialData(shopId);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-2">
          <Wallet className="h-4 w-4" />
          Available balance
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-4xl font-semibold tabular-nums tracking-tight">
          {formatCurrency(data.available)}
        </p>

        {data.totalPending > 0 && (
          <p className="text-sm text-muted-foreground">
            + {formatCurrency(data.totalPending)} pending validation
          </p>
        )}

        <WithdrawalSheet
          availableBalance={data.available}
          shopAddress={shopAddress}
          ownerName={ownerName}
        >
          <Button className="w-full" size="lg" disabled={data.available <= 0}>
            Request withdrawal
          </Button>
        </WithdrawalSheet>
      </CardContent>
    </Card>
  );
}

async function ActivityCard({ shopId }: { shopId: string }) {
  const data = await getFinancialData(shopId);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base font-medium">Recent activity</CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/dashboard/commissions" className="text-muted-foreground">
            View all <ArrowRight className="h-4 w-4 ml-1" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {data.recentCommissions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No commissions yet
          </p>
        ) : (
          <div className="space-y-3">
            {data.recentCommissions.map((c) => (
              <div key={c.id} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Badge variant={c.status === "PAID" ? "default" : "secondary"} className="text-xs">
                    {c.status === "PAID" ? "Earned" : "Pending"}
                  </Badge>
                  <span className="text-sm text-muted-foreground">{formatDate(c.createdAt)}</span>
                </div>
                <span className="text-sm font-medium tabular-nums">
                  +{formatCurrency(c.netRevenue)}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function HelpCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <HelpCircle className="h-4 w-4" />
          How does it work?
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="commissions">
            <AccordionTrigger className="text-sm">Where do my commissions come from?</AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground">
              When a customer scans your QR code and activates their crypto wallet, you earn a commission.
              The wallet provider pays us, and we pass it on to you.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="status">
            <AccordionTrigger className="text-sm">What do the statuses mean?</AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground">
              <strong>Pending</strong>: the commission is being validated (7 days max).<br />
              <strong>Earned</strong>: the commission is validated and available for withdrawal.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="withdrawal">
            <AccordionTrigger className="text-sm">How do I withdraw my earnings?</AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground">
              Click &quot;Request withdrawal&quot;, choose the amount and payment method.<br />
              <strong>Crypto</strong>: USDC on Base, processed within 24h.<br />
              <strong>Cash</strong>: delivered in an envelope to your shop address.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}

function ContactCard({ shopId }: { shopId: string }) {
  return (
    <Card className="border-dashed">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <Mail className="h-4 w-4" />
          Questions? Issues?
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Contact us by email. Include your ID for faster support.
        </p>
        <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-md">
          <code className="text-xs font-mono flex-1 truncate">{shopId}</code>
          <CopyButton value={shopId} />
        </div>
        <Button variant="outline" className="w-full" asChild>
          <a href="mailto:support@vndefi.com">
            <Mail className="h-4 w-4 mr-2" />
            support@vndefi.com
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}

export default async function DashboardPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/account/sign-in");
  }

  const shop = await getShopData(session.user.id);

  if (!shop) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <p className="text-muted-foreground">No shop associated with this account</p>
        <Button variant="outline" asChild>
          <Link href="mailto:support@vndefi.com">Contact support</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{shop.name}</h1>
        <p className="text-muted-foreground">Manage your commissions and withdrawals</p>
      </div>

      <Separator />

      <Suspense fallback={<BalanceSkeleton />}>
        <BalanceCard shopId={shop.id} shopAddress={shop.address} ownerName={shop.ownerName} />
      </Suspense>

      <Suspense fallback={<ActivitySkeleton />}>
        <ActivityCard shopId={shop.id} />
      </Suspense>

      <HelpCard />

      <ContactCard shopId={shop.id} />
    </div>
  );
}
