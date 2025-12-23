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
 */
export async function POST(request: Request) {
  try {
    // Récupérer les headers
    const signature = request.headers.get("X-Signature");
    const timestamp = request.headers.get("X-Timestamp");
    const eventId = request.headers.get("X-Event-Id");

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

    // Déterminer le provider (pour l'instant, on utilise "provider" par défaut)
    // TODO: Ajouter un header X-Provider ou le détecter depuis le payload
    const provider = "provider";

    // Traiter l'événement
    const result = await handleWebhookEvent(
      provider,
      eventId,
      payload.type,
      payload as { type: string; data: Record<string, unknown> }
    );

    console.log(`[Webhook] Event ${eventId} traité avec succès (duplicated: ${result.duplicated})`);

    return NextResponse.json({
      ok: true,
      duplicated: result.duplicated,
      invoiceId: result.invoiceId,
    });
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

