import { handleWebhookEvent } from "@/app/lib/webhooks/handleEvent";
import { verifyHmac, verifyTimestamp } from "@/app/lib/webhooks/verifyHmac";
import { NextResponse } from "next/server";

/**
 * Route webhook pour recevoir les événements des providers
 * 
 * Headers requis:
 * - X-Signature: sha256=...
 * - X-Timestamp: 1700000000
 * - X-Event-Id: evt_123456
 * 
 * Body: JSON avec type et data
 * 
 * Types supportés:
 * - user.signup     -> crée/maj AffiliateUser en SIGNUP
 * - user.activated  -> crée/maj Invoice PAID + passe AffiliateUser en ACTIVE
 * - invoice.paid    -> compat: alias de user.activated
 */
export async function POST(request: Request) {
  try {
    // Récupérer les headers
    const signature = request.headers.get("X-Signature");
    const timestamp = request.headers.get("X-Timestamp");
    const eventId = request.headers.get("X-Event-Id");
    const provider = request.headers.get("X-Provider");

    if (!signature) {
      return NextResponse.json(
        { error: "X-Signature header manquant" },
        { status: 401 }
      );
    }

    if (!timestamp) {
      return NextResponse.json(
        { error: "X-Timestamp header manquant" },
        { status: 401 }
      );
    }

    if (!eventId) {
      return NextResponse.json(
        { error: "X-Event-Id header manquant" },
        { status: 400 }
      );
    }

    if (!provider) {
      return NextResponse.json(
        { error: "X-Provider header manquant" },
        { status: 400 }
      );
    }

    // Vérifier le timestamp (anti-replay)
    if (!verifyTimestamp(timestamp)) {
      return NextResponse.json(
        { error: "Webhook expiré (timestamp trop ancien)" },
        { status: 401 }
      );
    }

    // Récupérer le RAW body (important pour HMAC)
    const rawBody = await request.text();

    // Récupérer le secret depuis les variables d'environnement
    // Pour l'instant, on utilise un secret par défaut (à configurer par provider)
    const webhookSecret = process.env.WEBHOOK_SECRET || "default-secret-change-me";

    // Vérifier la signature HMAC
    if (!verifyHmac({ secret: webhookSecret, timestamp, signature, rawBody })) {
      console.error(`[Webhook] Signature invalide pour eventId: ${eventId}`);
      return NextResponse.json(
        { error: "Signature invalide" },
        { status: 401 }
      );
    }

    // Parser le body JSON
    let payload: { type: string; data: Record<string, unknown> };
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { error: "Body JSON invalide" },
        { status: 400 }
      );
    }

    if (!payload.type) {
      return NextResponse.json(
        { error: "Type d'événement manquant" },
        { status: 400 }
      );
    }

    const supportedTypes = new Set([
      "user.signup",
      "user.activated",
      "invoice.paid",
    ]);

    if (!supportedTypes.has(payload.type)) {
      return NextResponse.json(
        { error: "Type d'événement non supporté" },
        { status: 400 }
      );
    }

    const typedPayload = payload as {
      type: "user.signup" | "user.activated" | "invoice.paid";
      data: Record<string, unknown>;
    };

    // Traiter l'événement
    const result = await handleWebhookEvent(
      provider,
      eventId,
      typedPayload.type,
      typedPayload
    );

    console.log(`[Webhook] Event ${eventId} traité avec succès (duplicated: ${result.duplicated})`);

    return NextResponse.json(
      {
        ok: true,
        duplicated: result.duplicated,
        invoiceId: result.invoiceId,
        affiliateUserId: result.affiliateUserId,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[Webhook] Erreur lors du traitement:", error);

    return NextResponse.json(
      {
        error: "Erreur interne du serveur",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

