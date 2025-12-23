import type {
  AffiliateUser,
  Prisma,
  RevenueEventType,
} from "@/app/generated/prisma/client";
import { prisma } from "@/app/lib/prisma";

type AcquisitionSource = "QR" | "LINK" | "API";

type SupportedEventType = "user.signup" | "user.activated" | "invoice.paid";

interface WebhookPayload {
  type: SupportedEventType;
  data: Record<string, unknown>;
}

interface SignupPayload {
  shopId: string;
  walletProviderId: string;
  partnerUserId: string;
  acquisitionSource: AcquisitionSource;
}

interface ActivationPayload {
  externalInvoiceId: string;
  shopId: string;
  walletProviderId: string;
  partnerUserId?: string;
  affiliateUserId?: string;
  grossRevenue: number;
  currency: string;
  paidAt?: Date;
  transactionHash?: string | null;
  acquisitionSource: AcquisitionSource;
  eventType: RevenueEventType;
}

const PILOT_EVENT_TYPE: RevenueEventType = "CPA";

/**
 * Gère un événement webhook et crée/met à jour l'Invoice correspondante
 *
 * RÈGLE D'OR: Le webhook ne crée QUE des Invoices, jamais de Commissions
 */
export async function handleWebhookEvent(
  provider: string,
  eventId: string,
  eventType: string,
  payload: WebhookPayload
): Promise<{
  ok: boolean;
  duplicated: boolean;
  invoiceId?: string;
  affiliateUserId?: string;
}> {
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
    if (eventType === "user.signup") {
      const { affiliateUserId } = await handleUserSignup(payload);

      await prisma.webhookEvent.update({
        where: { id: webhookEvent.id },
        data: { processedAt: new Date() },
      });

      return {
        ok: true,
        duplicated: false,
        affiliateUserId,
      };
    }

    if (eventType === "user.activated" || eventType === "invoice.paid") {
      const { invoiceId, affiliateUserId } = await handleUserActivated(payload);

      await prisma.webhookEvent.update({
        where: { id: webhookEvent.id },
        data: { processedAt: new Date() },
      });

      return {
        ok: true,
        duplicated: false,
        invoiceId,
        affiliateUserId,
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
    console.error(
      `[Webhook] Erreur lors du traitement de l'événement ${eventId}:`,
      error
    );
    throw error;
  }
}

async function handleUserSignup(
  payload: WebhookPayload
): Promise<{ affiliateUserId: string }> {
  const data = parseSignupPayload(payload);

  await ensureShopAndProviderExist({
    shopId: data.shopId,
    walletProviderId: data.walletProviderId,
  });

  const acquisitionSource = data.acquisitionSource ?? "QR";

  const existingAffiliate = await prisma.affiliateUser.findFirst({
    where: {
      partnerUserId: data.partnerUserId,
      walletProviderId: data.walletProviderId,
      shopId: data.shopId,
    },
  });

  if (existingAffiliate) {
    const shouldUpdate =
      existingAffiliate.status === "SIGNUP" &&
      existingAffiliate.acquisitionSource !== acquisitionSource;

    if (shouldUpdate) {
      await prisma.affiliateUser.update({
        where: { id: existingAffiliate.id },
        data: { acquisitionSource },
      });
    }

    console.log(
      `[Webhook] AffiliateUser conservé: ${existingAffiliate.id} (partnerUserId: ${data.partnerUserId})`
    );

    return { affiliateUserId: existingAffiliate.id };
  }

  const affiliateUser = await prisma.affiliateUser.create({
    data: {
      partnerUserId: data.partnerUserId,
      walletProviderId: data.walletProviderId,
      shopId: data.shopId,
      status: "SIGNUP",
      acquisitionSource,
    },
  });

  console.log(
    `[Webhook] AffiliateUser créé (signup): ${affiliateUser.id} (partnerUserId: ${data.partnerUserId})`
  );

  return { affiliateUserId: affiliateUser.id };
}

async function handleUserActivated(
  payload: WebhookPayload
): Promise<{ invoiceId: string; affiliateUserId: string }> {
  const data = parseActivationPayload(payload);

  await ensureShopAndProviderExist({
    shopId: data.shopId,
    walletProviderId: data.walletProviderId,
  });

  const affiliateUser = await resolveAffiliateUser(data);

  const invoice = await prisma.invoice.upsert({
    where: {
      externalId: data.externalInvoiceId,
    },
    create: {
      externalId: data.externalInvoiceId,
      eventType: PILOT_EVENT_TYPE,
      status: "PAID",
      grossRevenue: data.grossRevenue,
      currency: data.currency,
      amountInCurrency: data.grossRevenue,
      transactionHash: data.transactionHash ?? null,
      paidAt: data.paidAt ?? new Date(),
      rawPayload: payload as unknown as Prisma.JsonObject,
      shopId: data.shopId,
      affiliateUserId: affiliateUser.id,
      walletProviderId: data.walletProviderId,
    },
    update: {
      status: "PAID",
      eventType: PILOT_EVENT_TYPE,
      grossRevenue: data.grossRevenue,
      amountInCurrency: data.grossRevenue,
      currency: data.currency,
      paidAt: data.paidAt ?? new Date(),
      transactionHash: data.transactionHash ?? null,
      rawPayload: payload as unknown as Prisma.JsonObject,
      affiliateUserId: affiliateUser.id,
    },
  });

  console.log(
    `[Webhook] Invoice ${invoice.id} créée/mise à jour (externalId: ${data.externalInvoiceId}, affiliateUserId: ${affiliateUser.id})`
  );

  return { invoiceId: invoice.id, affiliateUserId: affiliateUser.id };
}

async function resolveAffiliateUser(
  data: ActivationPayload
): Promise<AffiliateUser> {
  if (data.affiliateUserId) {
    const affiliateUser = await prisma.affiliateUser.findUnique({
      where: { id: data.affiliateUserId },
    });

    if (!affiliateUser) {
      throw new Error(`AffiliateUser ${data.affiliateUserId} introuvable`);
    }

    if (affiliateUser.status !== "ACTIVE") {
      return prisma.affiliateUser.update({
        where: { id: affiliateUser.id },
        data: {
          status: "ACTIVE",
          activatedAt: affiliateUser.activatedAt ?? new Date(),
        },
      });
    }

    return affiliateUser;
  }

  if (!data.partnerUserId) {
    throw new Error("partnerUserId est requis lorsque affiliateUserId est absent");
  }

  const acquisitionSource = data.acquisitionSource ?? "QR";

  const existingAffiliate = await prisma.affiliateUser.findFirst({
    where: {
      partnerUserId: data.partnerUserId,
      walletProviderId: data.walletProviderId,
      shopId: data.shopId,
    },
  });

  if (existingAffiliate) {
    const needsUpdate =
      existingAffiliate.status !== "ACTIVE" ||
      (!existingAffiliate.activatedAt && data.paidAt);

    if (needsUpdate) {
      return prisma.affiliateUser.update({
        where: { id: existingAffiliate.id },
        data: {
          status: "ACTIVE",
          activatedAt: existingAffiliate.activatedAt ?? data.paidAt ?? new Date(),
          acquisitionSource: existingAffiliate.acquisitionSource ?? acquisitionSource,
        },
      });
    }

    return existingAffiliate;
  }

  return prisma.affiliateUser.create({
    data: {
      partnerUserId: data.partnerUserId,
      walletProviderId: data.walletProviderId,
      shopId: data.shopId,
      status: "ACTIVE",
      activatedAt: data.paidAt ?? new Date(),
      acquisitionSource,
    },
  });
}

async function ensureShopAndProviderExist({
  shopId,
  walletProviderId,
}: {
  shopId: string;
  walletProviderId: string;
}): Promise<void> {
  const [shop, walletProvider] = await Promise.all([
    prisma.shop.findUnique({ where: { id: shopId } }),
    prisma.walletProvider.findUnique({ where: { id: walletProviderId } }),
  ]);

  if (!shop) {
    throw new Error(`Shop ${shopId} introuvable`);
  }

  if (!walletProvider) {
    throw new Error(`WalletProvider ${walletProviderId} introuvable`);
  }
}

function parseSignupPayload(payload: WebhookPayload): SignupPayload {
  const { data } = payload;
  const shopId = asRequiredString(data, "shopId");
  const walletProviderId = asRequiredString(data, "walletProviderId");
  const partnerUserId = asRequiredString(data, "partnerUserId");
  const acquisitionSource = asOptionalAcquisitionSource(data, "acquisitionSource");

  return {
    shopId,
    walletProviderId,
    partnerUserId,
    acquisitionSource: acquisitionSource ?? "QR",
  };
}

function parseActivationPayload(payload: WebhookPayload): ActivationPayload {
  const { data } = payload;

  const externalInvoiceId = asRequiredString(data, "externalInvoiceId");
  const shopId = asRequiredString(data, "shopId");
  const walletProviderId = asRequiredString(data, "walletProviderId");
  const currency = asOptionalString(data, "currency") ?? "EUR";
  const partnerUserId = asOptionalString(data, "partnerUserId");
  const affiliateUserId = asOptionalString(data, "affiliateUserId");
  const transactionHash = asOptionalString(data, "transactionHash");
  const eventType = resolveEventType(data);
  const acquisitionSource = asOptionalAcquisitionSource(data, "acquisitionSource");

  const grossRevenue = resolveGrossRevenue(data);

  const paidAt = asOptionalDate(data, "paidAt");

  return {
    externalInvoiceId,
    shopId,
    walletProviderId,
    partnerUserId,
    affiliateUserId,
    grossRevenue,
    currency,
    paidAt,
    transactionHash,
    acquisitionSource: acquisitionSource ?? "QR",
    eventType,
  };
}

function asRequiredString(
  data: Record<string, unknown>,
  key: string
): string {
  const value = data[key];

  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${key} est requis`);
  }

  return value;
}

function asOptionalString(
  data: Record<string, unknown>,
  key: string
): string | undefined {
  const value = data[key];

  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error(`${key} doit être une chaîne de caractères`);
  }

  const trimmed = value.trim();

  return trimmed === "" ? undefined : trimmed;
}

function asOptionalDate(
  data: Record<string, unknown>,
  key: string
): Date | undefined {
  const value = data[key];

  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error(`${key} doit être une date ISO (string)`);
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${key} doit être une date ISO valide`);
  }

  return parsed;
}

function asOptionalAcquisitionSource(
  data: Record<string, unknown>,
  key: string
): AcquisitionSource | null {
  const value = data[key];

  if (value === undefined || value === null) {
    return null;
  }

  if (value === "QR" || value === "LINK" || value === "API") {
    return value;
  }

  throw new Error(`${key} doit être "QR", "LINK" ou "API"`);
}

function resolveGrossRevenue(data: Record<string, unknown>): number {
  const primary = data.grossRevenue;
  const legacy = data.grossAmount;

  if (typeof primary === "number" && !Number.isNaN(primary) && primary > 0) {
    return primary;
  }

  if (typeof legacy === "number" && !Number.isNaN(legacy) && legacy > 0) {
    return legacy;
  }

  throw new Error("grossRevenue (ou grossAmount) doit être un nombre positif");
}

function resolveEventType(data: Record<string, unknown>): RevenueEventType {
  const raw = asOptionalString(data, "eventType");

  if (raw === null || raw === undefined) {
    return PILOT_EVENT_TYPE;
  }

  if (raw === PILOT_EVENT_TYPE) {
    return PILOT_EVENT_TYPE;
  }

  throw new Error('eventType doit être "CPA" pendant le pilote');
}

