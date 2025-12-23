import crypto from "crypto";

/**
 * Vérifie la signature HMAC d'un webhook
 * 
 * @param secret - Secret partagé avec le provider
 * @param timestamp - Timestamp de l'événement (en secondes)
 * @param signature - Signature reçue (format: "sha256=...")
 * @param rawBody - Corps de la requête en RAW (string)
 * @returns true si la signature est valide
 */
export function verifyHmac({
  secret,
  timestamp,
  signature,
  rawBody,
}: {
  secret: string;
  timestamp: string;
  signature: string;
  rawBody: string;
}): boolean {
  const payload = `${timestamp}.${rawBody}`;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  // Nettoyer la signature (enlever le préfixe "sha256=" si présent)
  const received = signature.replace(/^sha256=/, "").trim();

  // Vérifier que les signatures ont la même longueur
  // (une signature SHA256 hex fait toujours 64 caractères)
  if (expected.length !== received.length) {
    return false;
  }

  // Convertir les hex strings en buffers pour timingSafeEqual
  // IMPORTANT: utiliser "hex" pour décoder correctement
  let expectedBuffer: Buffer;
  let receivedBuffer: Buffer;

  try {
    expectedBuffer = Buffer.from(expected, "hex");
    receivedBuffer = Buffer.from(received, "hex");
  } catch {
    // Format invalide (non-hex)
    return false;
  }

  // Vérifier à nouveau la longueur des buffers (devrait être 32 bytes pour SHA256)
  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  // Protection contre les timing attacks
  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

/**
 * Vérifie que le timestamp n'est pas trop ancien (anti-replay)
 * 
 * @param timestamp - Timestamp en secondes
 * @param maxDrift - Dérive maximale en millisecondes (défaut: 5 minutes)
 * @returns true si le timestamp est valide
 */
export function verifyTimestamp(
  timestamp: string,
  maxDrift: number = 5 * 60 * 1000 // 5 minutes par défaut
): boolean {
  const timestampMs = Number(timestamp) * 1000;
  const now = Date.now();
  const drift = Math.abs(now - timestampMs);

  return drift <= maxDrift;
}

