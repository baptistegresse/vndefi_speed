"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";

interface WithdrawalSheetProps {
  availableBalance: number;
  shopAddress: string;
  ownerName: string | null;
  children: React.ReactNode;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}

export function WithdrawalSheet({ availableBalance, shopAddress, ownerName, children }: WithdrawalSheetProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [amount, setAmount] = useState("");
  const [paymentType, setPaymentType] = useState<"CRYPTO" | "FIAT">("CRYPTO");
  const [address, setAddress] = useState("");

  const numAmount = parseFloat(amount) || 0;
  const isValid = numAmount > 0 && numAmount <= availableBalance && (paymentType === "FIAT" || address.trim());

  const handleSubmit = async () => {
    if (!isValid) return;

    setIsLoading(true);

    try {
      const res = await fetch("/api/withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          amount: numAmount,
          paymentType,
          destinationAddress: paymentType === "CRYPTO" ? address : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Error");
      }

      toast.success("Withdrawal request submitted");
      setOpen(false);
      setAmount("");
      setAddress("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {children}
      </SheetTrigger>
      <SheetContent side="right" className="flex flex-col">
        <SheetHeader>
          <SheetTitle>Request withdrawal</SheetTitle>
          <SheetDescription>
            Available balance: {formatCurrency(availableBalance)}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 px-4">
          <div className="space-y-2">
            <Label htmlFor="amount">Amount to withdraw</Label>
            <div className="relative">
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0.01"
                max={availableBalance}
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="text-lg"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setAmount(availableBalance.toFixed(2))}
              >
                Max
              </button>
            </div>
            {numAmount > availableBalance && (
              <p className="text-sm text-destructive">Amount exceeds available balance</p>
            )}
          </div>

          <div className="space-y-3">
            <Label>Payment method</Label>
            <RadioGroup value={paymentType} onValueChange={(v) => setPaymentType(v as "CRYPTO" | "FIAT")}>
              <div className="flex items-center space-x-3 rounded-lg border p-3">
                <RadioGroupItem value="CRYPTO" id="crypto" />
                <Label htmlFor="crypto" className="flex-1 cursor-pointer">
                  <span className="font-medium">Crypto</span>
                  <span className="block text-sm text-muted-foreground">USDC on Base</span>
                </Label>
              </div>
              <div className="flex items-center space-x-3 rounded-lg border p-3">
                <RadioGroupItem value="FIAT" id="fiat" />
                <Label htmlFor="fiat" className="flex-1 cursor-pointer">
                  <span className="font-medium">Cash</span>
                  <span className="block text-sm text-muted-foreground">Hand delivery in an envelope to your name</span>
                </Label>
              </div>
            </RadioGroup>
          </div>

          {paymentType === "CRYPTO" && (
            <div className="space-y-2">
              <Label htmlFor="address">Receiving address (Base)</Label>
              <Input
                id="address"
                type="text"
                placeholder="0x..."
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Double-check the address. Crypto transactions are irreversible.
              </p>
            </div>
          )}

          {paymentType === "FIAT" && (
            <div className="p-4 bg-muted/50 rounded-lg space-y-3">
              <div className="flex items-start gap-3">
                <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <div>
                  {ownerName && (
                    <p className="font-medium">{ownerName}</p>
                  )}
                  <p className="text-sm text-muted-foreground">{shopAddress}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Cash will be delivered in an envelope to your name at this address.
              </p>
            </div>
          )}
        </div>

        <SheetFooter>
          <Button
            onClick={handleSubmit}
            disabled={!isValid || isLoading}
            className="w-full"
            size="lg"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              `Withdraw ${numAmount > 0 ? formatCurrency(numAmount) : ""}`
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
