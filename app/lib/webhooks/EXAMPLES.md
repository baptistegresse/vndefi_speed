# Webhooks Wallet Providers — CPA Pilote

Flux ultra-simple pour le pilote : **deux événements**, idempotents et sécurisés. Seul le CPA est rémunérateur pendant cette phase.

## 🔐 Headers requis

```http
POST /api/webhooks/provider
Content-Type: application/json
X-Signature: sha256=<signature_hmac>
X-Timestamp: <timestamp_unix_seconds>
X-Event-Id: <unique_event_id>
X-Provider: <provider_id>
```

Signature: `HMAC_SHA256(secret, timestamp + "." + rawBody)`

## 📋 Événements supportés (CPA only)

### 1) `user.signup` — lead créé (aucune dette)

```json
{
  "type": "user.signup",
  "data": {
    "shopId": "shop_abc123",
    "walletProviderId": "wallet_provider_001",
    "partnerUserId": "wallet_user_789",
    "acquisitionSource": "QR"
  }
}
```

Effet : crée ou met à jour `AffiliateUser` en `SIGNUP`. **Aucune Invoice.**

Champs obligatoires : `shopId`, `walletProviderId`, `partnerUserId`

### 2) `user.activated` — CPA (argent dû)

```json
{
  "type": "user.activated",
  "data": {
    "externalInvoiceId": "cpa_evt_2025_001",
    "shopId": "shop_abc123",
    "walletProviderId": "wallet_provider_001",
    "partnerUserId": "wallet_user_789",
    "grossRevenue": 50.0,
    "currency": "EUR",
    "paidAt": "2025-12-23T14:30:00Z",
    "acquisitionSource": "QR"
  }
}
```

Effet : passe l'`AffiliateUser` en `ACTIVE` et crée/maj l'`Invoice` en `PAID` (`eventType` forcé à `CPA`). `invoice.paid` reste accepté comme alias rétro-compatible.

Champs obligatoires : `externalInvoiceId`, `shopId`, `walletProviderId`, `grossRevenue` (>0) et `partnerUserId` ou `affiliateUserId`

## ✅ Réponses

```json
// Succès
{
  "ok": true,
  "duplicated": false,
  "invoiceId": "inv_123",
  "affiliateUserId": "aff_123"
}

// Idempotence (même X-Event-Id)
{
  "ok": true,
  "duplicated": true
}
```

## 🔒 Rappels sécurité

- Tolérance timestamp : 5 minutes (anti-replay)
- HMAC obligatoire sur le **raw body**
- Ne jamais inclure de secrets ou PII dans les payloads

Exemple de génération de signature (Node) :

```javascript
const crypto = require("crypto");
const payload = JSON.stringify({ type: "user.activated", data: {/* ... */} });
const timestamp = Math.floor(Date.now() / 1000).toString();
const signature = `sha256=${crypto
  .createHmac("sha256", process.env.WEBHOOK_SECRET)
  .update(`${timestamp}.${payload}`)
  .digest("hex")}`;
```

## 🧪 Test rapide (curl)

```bash
export TS=$(date +%s)
export BODY='{"type":"user.activated","data":{"externalInvoiceId":"inv_test_001","shopId":"shop_abc123","walletProviderId":"wallet_provider_001","partnerUserId":"user_test_001","grossRevenue":50,"currency":"EUR"}}'
export SIG="sha256=$(echo -n "${TS}.${BODY}" | openssl dgst -sha256 -hmac "${WEBHOOK_SECRET}" -hex | sed 's/^.* //')"

curl -X POST http://localhost:3001/api/webhooks/provider \
  -H "Content-Type: application/json" \
  -H "X-Signature: ${SIG}" \
  -H "X-Timestamp: ${TS}" \
  -H "X-Event-Id: evt_${TS}" \
  -d "${BODY}"
```

## 🧭 Règles produit (pilote)

- Signup → crée seulement `AffiliateUser` (`SIGNUP`)
- Activation → crée/maj `Invoice` (`PAID`, `eventType=CPA`)
- Le webhook **ne crée jamais** de `Commission` (fait côté job interne)
- Idempotence : `X-Event-Id` unique, doublon accepté sans effet de bord

