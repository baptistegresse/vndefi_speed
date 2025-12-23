# Guide d'intégration Webhook - Wallet Providers (CPA)

Deux événements simples, même contrat de sécurité (HMAC + anti-replay + idempotence).

## 🔐 Génération de la signature HMAC

```javascript
const crypto = require("crypto");

function generateWebhookSignature(secret, timestamp, body) {
  const payload = `${timestamp}.${body}`;
  return `sha256=${crypto.createHmac("sha256", secret).update(payload).digest("hex")}`;
}

// Exemple
const timestamp = Math.floor(Date.now() / 1000).toString();
const body = JSON.stringify({
  type: "user.activated",
  data: {
    externalInvoiceId: "cpa_evt_001",
    shopId: "shop_123",
    walletProviderId: "wallet_789",
    partnerUserId: "user_456",
    grossRevenue: 50,
    currency: "EUR",
    paidAt: new Date().toISOString(),
  },
});
const signature = generateWebhookSignature(process.env.WEBHOOK_SECRET, timestamp, body);
console.log({ "X-Signature": signature, "X-Timestamp": timestamp });
```

Equivalents existent en Python, PHP, Go, Ruby: même payload et même formule `timestamp + "." + rawBody`.

## 📤 Envoi de webhook

```javascript
async function sendWebhook(eventType, data) {
  const secret = process.env.WEBHOOK_SECRET;
  const webhookUrl = "https://your-domain.com/api/webhooks/provider";
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const eventId = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const body = JSON.stringify({ type: eventType, data });
  const signature = generateWebhookSignature(secret, timestamp, body);

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Signature": signature,
      "X-Timestamp": timestamp,
      "X-Event-Id": eventId,
    },
    body,
  });

  return response.json();
}

// 1) Lead (signup)
await sendWebhook("user.signup", {
  shopId: "shop_123",
  walletProviderId: "wallet_789",
  partnerUserId: "user_456",
  acquisitionSource: "QR",
});

// 2) CPA (activation)
await sendWebhook("user.activated", {
  externalInvoiceId: "cpa_evt_001",
  shopId: "shop_123",
  walletProviderId: "wallet_789",
  partnerUserId: "user_456",
  grossRevenue: 50,
  currency: "EUR",
  paidAt: new Date().toISOString(),
});
```

## 🧪 Test rapide (cURL)

```bash
SECRET="your-webhook-secret"
WEBHOOK_URL="https://your-domain.com/api/webhooks/provider"
TS=$(date +%s)
EVENT_ID="evt_${TS}_$(openssl rand -hex 4)"
BODY='{"type":"user.activated","data":{"externalInvoiceId":"inv_001","shopId":"shop_123","walletProviderId":"wallet_789","partnerUserId":"user_456","grossRevenue":50,"currency":"EUR"}}'
SIG="sha256=$(echo -n "${TS}.${BODY}" | openssl dgst -sha256 -hmac "${SECRET}" -hex | sed 's/^.* //')"

curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -H "X-Signature: ${SIG}" \
  -H "X-Timestamp: ${TS}" \
  -H "X-Event-Id: ${EVENT_ID}" \
  -d "${BODY}"
```

## ✅ Checklist d'intégration

- Headers `X-Signature`, `X-Timestamp`, `X-Event-Id` envoyés
- `user.signup` : `shopId`, `walletProviderId`, `partnerUserId`
- `user.activated` : `externalInvoiceId`, `shopId`, `walletProviderId`, `grossRevenue>0`, `currency`, et `partnerUserId` ou `affiliateUserId`
- `eventId` unique par appel (idempotence)
- Horodatage < 5 minutes
- Logging des tentatives + retries réseau raisonnables

## 🔄 Rappels produit

- Signup → enregistre le lead (`AffiliateUser` en `SIGNUP`)
- Activation/CPA → passe l'utilisateur en `ACTIVE` + crée/maj `Invoice` en `PAID`
- Jamais de `Commission` créée par webhook (calcul interne)

