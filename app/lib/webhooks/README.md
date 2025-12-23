# Webhook System

Système de webhook sécurisé pour recevoir des événements des providers.

## 🔒 Sécurité

### HMAC Verification
- Signature: `HMAC_SHA256(secret, timestamp + "." + rawBody)`
- Protection contre les timing attacks avec `crypto.timingSafeEqual`
- Format: `sha256=...`

### Anti-Replay
- Vérification du timestamp (dérive max: 5 minutes)
- Protection contre les attaques de rejeu

### Idempotence
- Table `WebhookEvent` avec `eventId` unique
- Un même événement peut être appelé plusieurs fois sans effet de bord

## 📋 Contrat du Webhook

### Headers requis
```
X-Signature: sha256=abcdef...
X-Timestamp: 1700000000
X-Event-Id: evt_123456
```

### Body (JSON)
```json
{
  "type": "invoice.paid",
  "data": {
    "externalInvoiceId": "inv_987",
    "shopId": "shop_123",
    "affiliateUserId": "aff_456",
    "walletProviderId": "wallet_789",
    "grossAmount": 1000,
    "currency": "EUR",
    "paidAt": "2025-12-23T20:57:00Z",
    "eventType": "CPA",
    "transactionHash": "0x..."
  }
}
```

## 🎯 Règles d'or

1. **Webhook = write-only** : Ne fait que créer/mettre à jour des Invoices
2. **Invoice = source de vérité** : Toute transaction financière passe par Invoice
3. **Commission = dérivée** : Les commissions sont générées séparément (job async)
4. **Idempotence partout** : Un même `eventId` ne peut être traité qu'une fois
5. **HMAC toujours sur le RAW body** : Ne jamais parser avant de vérifier la signature

## 🧪 Tests

```bash
# Tester le webhook
bun run webhook:test
```

## 🔧 Configuration

Variable d'environnement requise:
```env
WEBHOOK_SECRET=your-secret-key-here
```

## 📍 Endpoint

```
POST /api/webhooks/provider
```

## 🔄 Flux

1. Réception du webhook
2. Vérification HMAC
3. Vérification timestamp (anti-replay)
4. Vérification idempotence (WebhookEvent)
5. Création/mise à jour Invoice
6. Logging & audit

## ⚠️ Important

- **JAMAIS** de création de Commission dans le webhook
- Les commissions sont générées par un job séparé après création d'Invoice
- L'Invoice est la source de vérité unique

