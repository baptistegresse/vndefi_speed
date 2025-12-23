import { prisma } from "@/app/lib/prisma";

/**
 * Purge des données pilot CPA (affiliés, invoices, commissions, webhooks).
 * À exécuter manuellement (ex: tsx app/lib/webhooks/pilotReset.ts) après confirmation.
 * Ne touche pas aux shops ni aux wallet providers.
 */
export async function purgePilotData(): Promise<void> {
  console.log("[PilotReset] Purge pilot CPA data — start");

  await prisma.$transaction([
    prisma.commission.deleteMany({ where: { eventType: "CPA" } }),
    prisma.invoice.deleteMany({ where: { eventType: "CPA" } }),
    prisma.affiliateUser.deleteMany({}),
    prisma.webhookEvent.deleteMany({}),
  ]);

  console.log("[PilotReset] Purge pilot CPA data — done");
}

// Allow running directly with ts-node/tsx
if (require.main === module) {
  purgePilotData()
    .then(() => {
      console.log("[PilotReset] Completed");
      process.exit(0);
    })
    .catch((error) => {
      console.error("[PilotReset] Failed", error);
      process.exit(1);
    });
}

