import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/app/lib/prisma";

/**
 * Types pour les événements webhook
 */
export interface WebhookEventData {
  type: string;
  data: {
    externalInvoiceId?: string;
    shopId?: string;
    affiliateUserId?: string;
    walletProviderId?: string;
    grossAmount?: number;
    currency?: string;
    paidAt?: string;
    eventType?: "CPA" | "DEPOSIT" | "REVENUE_SHARE";
    transactionHash?: string;
    [key: string]: unknown;
  };
}

/**
 * Gère un événement webhook et crée/met à jour l'Invoice correspondante
 * 
 * RÈGLE D'OR: Le webhook ne crée QUE des Invoices, jamais de Commissions
 */
export async function handleWebhookEvent(
  provider: string,
  eventId: string,
  eventType: string,
  payload: WebhookEventData
): Promise<{ ok: boolean; duplicated: boolean; invoiceId?: string }> {
  // Vérifier l'idempotence
  const existing = await prisma.webhookEvent.findUnique({
    where: { eventId },
  });

  if (existing) {
    console.log(`[Webhook] Event ${eventId} déjà traité (idempotence)`);
    return { ok: true, duplicated: true };
  }

  // Enregistrer l'événement
  const webhookEvent = await prisma.webhookEvent.create({
    data: {
      provider,
      eventId,
      type: eventType,
      payload: payload as unknown as Prisma.JsonObject,
    },
  });

  try {
    // Traiter uniquement les événements invoice.paid
    if (eventType === "invoice.paid") {
      const invoice = await handleInvoicePaid(payload);

      // Marquer comme traité
      await prisma.webhookEvent.update({
        where: { id: webhookEvent.id },
        data: { processedAt: new Date() },
      });

      return {
        ok: true,
        duplicated: false,
        invoiceId: invoice.id,
      };
    }

    // Autres types d'événements non gérés pour l'instant
    console.log(`[Webhook] Type d'événement non géré: ${eventType}`);

    await prisma.webhookEvent.update({
      where: { id: webhookEvent.id },
      data: { processedAt: new Date() },
    });

    return { ok: true, duplicated: false };
  } catch (error) {
    console.error(`[Webhook] Erreur lors du traitement de l'événement ${eventId}:`, error);
    throw error;
  }
}

/**
 * Gère un événement invoice.paid
 * Crée ou met à jour une Invoice (source de vérité)
 */
async function handleInvoicePaid(
  payload: WebhookEventData
): Promise<{ id: string }> {
  const { data } = payload;

  if (!data.externalInvoiceId) {
    throw new Error("externalInvoiceId est requis");
  }

  if (!data.shopId) {
    throw new Error("shopId est requis");
  }

  if (!data.affiliateUserId) {
    throw new Error("affiliateUserId est requis");
  }

  if (!data.walletProviderId) {
    throw new Error("walletProviderId est requis");
  }

  if (!data.grossAmount || data.grossAmount <= 0) {
    throw new Error("grossAmount doit être positif");
  }

  // Vérifier que le shop existe
  const shop = await prisma.shop.findUnique({
    where: { id: data.shopId },
  });

  if (!shop) {
    throw new Error(`Shop ${data.shopId} introuvable`);
  }

  // Vérifier que l'affiliate user existe
  const affiliateUser = await prisma.affiliateUser.findUnique({
    where: { id: data.affiliateUserId },
  });

  if (!affiliateUser) {
    throw new Error(`AffiliateUser ${data.affiliateUserId} introuvable`);
  }

  // Vérifier que le wallet provider existe
  const walletProvider = await prisma.walletProvider.findUnique({
    where: { id: data.walletProviderId },
  });

  if (!walletProvider) {
    throw new Error(`WalletProvider ${data.walletProviderId} introuvable`);
  }

  // Créer ou mettre à jour l'Invoice (idempotence via externalId)
  const invoice = await prisma.invoice.upsert({
    where: {
      externalId: data.externalInvoiceId,
    },
    create: {
      externalId: data.externalInvoiceId,
      eventType: data.eventType || "CPA",
      status: "PAID",
      grossRevenue: data.grossAmount,
      currency: data.currency || "EUR",
      amountInCurrency: data.grossAmount,
      transactionHash: data.transactionHash || null,
      paidAt: data.paidAt ? new Date(data.paidAt) : new Date(),
      rawPayload: payload as unknown as Prisma.JsonObject,
      shopId: data.shopId,
      affiliateUserId: data.affiliateUserId,
      walletProviderId: data.walletProviderId,
    },
    update: {
      // Ne mettre à jour que si le statut change ou si des infos manquantes sont ajoutées
      status: "PAID",
      paidAt: data.paidAt ? new Date(data.paidAt) : new Date(),
      transactionHash: data.transactionHash || undefined,
      rawPayload: payload as unknown as Prisma.JsonObject,
    },
  });

  console.log(`[Webhook] Invoice ${invoice.id} créée/mise à jour (externalId: ${data.externalInvoiceId})`);

  return { id: invoice.id };
}

