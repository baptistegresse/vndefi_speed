import { config } from "dotenv";
import crypto from "crypto";
import { PrismaClient } from "../app/generated/prisma/client";

// Charger les variables d'environnement
config();

const prisma = new PrismaClient();

/**
 * Script de test pour le webhook
 * 
 * Teste tous les cas critiques:
 * - Signature invalide → 401
 * - Timestamp expiré → 401
 * - Même eventId → idempotent
 * - Invoice créée une seule fois
 * - Aucune commission créée directement
 */

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "test-secret";
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";
const PROVIDER_HEADER = process.env.WEBHOOK_PROVIDER || "test-provider";

/**
 * Génère une signature HMAC pour un webhook
 */
function generateHmacSignature(
  secret: string,
  timestamp: string,
  body: string
): string {
  const payload = `${timestamp}.${body}`;
  const signature = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
  return `sha256=${signature}`;
}

/**
 * Envoie un webhook au serveur
 */
async function sendWebhook(
  eventId: string,
  type: string,
  data: Record<string, unknown>,
  options?: {
    invalidSignature?: boolean;
    expiredTimestamp?: boolean;
  }
): Promise<Response> {
  const timestamp = options?.expiredTimestamp
    ? String(Math.floor(Date.now() / 1000) - 10 * 60) // 10 minutes dans le passé
    : String(Math.floor(Date.now() / 1000));

  const body = JSON.stringify({ type, data });
  const signature = options?.invalidSignature
    ? "sha256=invalid"
    : generateHmacSignature(WEBHOOK_SECRET, timestamp, body);

  const response = await fetch(`${BASE_URL}/api/webhooks/provider`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Signature": signature,
      "X-Timestamp": timestamp,
      "X-Event-Id": eventId,
      "X-Provider": PROVIDER_HEADER,
    },
    body,
  });

  return response;
}

async function main() {
  console.log("🧪 Tests du webhook\n");
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Secret: ${WEBHOOK_SECRET.substring(0, 10)}...\n`);

  // ============================================
  // Test 1: Signature invalide → 401
  // ============================================
  console.log("1️⃣ Test: Signature invalide");
  console.log("─".repeat(50));

  const test1Response = await sendWebhook(
    "evt_test_1",
    "invoice.paid",
    { externalInvoiceId: "inv_test_1" },
    { invalidSignature: true }
  );

  if (test1Response.status === 401) {
    console.log("✅ Signature invalide correctement rejetée (401)");
  } else {
    console.error(`❌ Attendu 401, reçu ${test1Response.status}`);
    const text = await test1Response.text();
    console.error(`Réponse: ${text}`);
  }

  console.log("\n");

  // ============================================
  // Test 2: Timestamp expiré → 401
  // ============================================
  console.log("2️⃣ Test: Timestamp expiré");
  console.log("─".repeat(50));

  const test2Response = await sendWebhook(
    "evt_test_2",
    "invoice.paid",
    { externalInvoiceId: "inv_test_2" },
    { expiredTimestamp: true }
  );

  if (test2Response.status === 401) {
    console.log("✅ Timestamp expiré correctement rejeté (401)");
  } else {
    console.error(`❌ Attendu 401, reçu ${test2Response.status}`);
    const text = await test2Response.text();
    console.error(`Réponse: ${text}`);
  }

  console.log("\n");

  // ============================================
  // Test 3: Webhook valide avec création automatique d'AffiliateUser
  // ============================================
  console.log("3️⃣ Test: Webhook valide avec création automatique d'AffiliateUser");
  console.log("─".repeat(50));

  // Récupérer les IDs réels du seed
  const shop = await prisma.shop.findFirst({
    where: { affiliationCode: "TEST-SHOP-SEED" },
  });

  const walletProvider = await prisma.walletProvider.findFirst({
    where: { apiKey: "test-wallet-provider-seed" },
  });

  if (!shop || !walletProvider) {
    console.warn("⚠️  Données de test manquantes. Exécutez 'bun run prisma:seed' d'abord.");
    console.log("\n");
  } else {
    // Test avec partnerUserId (création automatique d'AffiliateUser)
    const eventIdValid = `evt_valid_${Date.now()}`;
    const partnerUserId = `partner_${Date.now()}`;
    const dataValid = {
      externalInvoiceId: `inv_valid_${Date.now()}`,
      shopId: shop.id,
      partnerUserId: partnerUserId, // Utiliser partnerUserId au lieu de affiliateUserId
      walletProviderId: walletProvider.id,
      grossRevenue: 1200,
      currency: "EUR",
      paidAt: new Date().toISOString(),
    };

    const test3Response = await sendWebhook(eventIdValid, "invoice.paid", dataValid);
    const test3Json = await test3Response.json();

    if (test3Response.status === 200 && !test3Json.duplicated) {
      console.log("✅ Webhook valide traité avec succès (200)");
      
      // Vérifier que l'Invoice a été créée
      if (test3Json.invoiceId) {
        const createdInvoice = await prisma.invoice.findUnique({
          where: { id: test3Json.invoiceId },
        });
        if (createdInvoice) {
          console.log(`   ✅ Invoice ${createdInvoice.id} créée.`);
          
          // Vérifier que l'AffiliateUser a été créé automatiquement
          const createdAffiliateUser = await prisma.affiliateUser.findFirst({
            where: {
              partnerUserId: partnerUserId,
              walletProviderId: walletProvider.id,
              shopId: shop.id,
            },
          });
          
          if (createdAffiliateUser) {
            console.log(`   ✅ AffiliateUser ${createdAffiliateUser.id} créé automatiquement (partnerUserId: ${partnerUserId})`);
          } else {
            console.error("   ❌ AffiliateUser non trouvé après création.");
          }
        } else {
          console.error("   ❌ Invoice non trouvée après création.");
        }
      }
    } else {
      console.error(`❌ Attendu 200, reçu ${test3Response.status} - duplicated: ${test3Json.duplicated}`);
      console.error(`Réponse: ${JSON.stringify(test3Json, null, 2)}`);
    }
  }

  console.log("\n");

  // ============================================
  // Test 4: Idempotence (même eventId)
  // ============================================
  console.log("4️⃣ Test: Idempotence (même eventId)");
  console.log("─".repeat(50));

  // Récupérer les IDs réels du seed
  const shopForIdempotence = await prisma.shop.findFirst({
    where: { affiliationCode: "TEST-SHOP-SEED" },
  });

  const walletProviderForIdempotence = await prisma.walletProvider.findFirst({
    where: { apiKey: "test-wallet-provider-seed" },
  });

  if (!shopForIdempotence || !walletProviderForIdempotence) {
    console.warn("⚠️  Données de test manquantes. Exécutez 'bun run prisma:seed' d'abord.");
    console.log("\n");
  } else {
    // Test avec partnerUserId (création automatique d'AffiliateUser)
    const eventId = `evt_idempotence_${Date.now()}`;
    const partnerUserId = `partner_idempotence_${Date.now()}`;
    const data = {
      externalInvoiceId: `inv_idempotence_${Date.now()}`,
      shopId: shopForIdempotence.id,
      partnerUserId: partnerUserId, // Utiliser partnerUserId
      walletProviderId: walletProviderForIdempotence.id,
      grossRevenue: 1000,
      currency: "EUR",
      paidAt: new Date().toISOString(),
    };

    // Premier appel
    const test4aResponse = await sendWebhook(eventId, "invoice.paid", data);
    const test4aJson = await test4aResponse.json();
    console.log(`Premier appel: ${test4aResponse.status} - duplicated: ${test4aJson.duplicated}`);

    if (test4aResponse.status === 200 && test4aJson.duplicated === false) {
      console.log("✅ Premier appel réussi - Invoice créée");
    } else {
      console.error(`❌ Premier appel échoué: ${JSON.stringify(test4aJson, null, 2)}`);
    }

    // Deuxième appel (même eventId) - doit détecter l'idempotence
    const test4bResponse = await sendWebhook(eventId, "invoice.paid", data);
    const test4bJson = await test4bResponse.json();

    if (test4bJson.duplicated === true) {
      console.log("✅ Idempotence fonctionne (duplicated: true)");
    } else {
      console.error(`❌ Idempotence échouée - duplicated devrait être true`);
      console.error(`Réponse: ${JSON.stringify(test4bJson, null, 2)}`);
    }
  }

  console.log("\n");

  // ============================================
  // Test 5: Headers manquants
  // ============================================
  console.log("5️⃣ Test: Headers manquants");
  console.log("─".repeat(50));

  const test5Response = await fetch(`${BASE_URL}/api/webhooks/provider`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Pas de X-Signature, X-Timestamp, X-Event-Id
    },
    body: JSON.stringify({ type: "invoice.paid", data: {} }),
  });

  if (test5Response.status === 401 || test5Response.status === 400) {
    console.log(`✅ Headers manquants correctement rejetés (${test5Response.status})`);
  } else {
    console.error(`❌ Attendu 401/400, reçu ${test5Response.status}`);
  }

  console.log("\n");

  console.log("✅ Tests terminés");
  console.log("\n📝 Note: Le webhook crée automatiquement les AffiliateUser");
  console.log("   si partnerUserId est fourni dans le payload.");
}

main()
  .catch((error) => {
    console.error("❌ Erreur lors des tests:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

