/**
 * HMAC-SHA256 webhook signature utilities.
 * Used to sign outgoing webhook payloads and verify incoming webhook requests,
 * following the `sha256=<hex>` convention (similar to GitHub webhook signatures).
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

/** Maximum age of a webhook timestamp before it is rejected (5 minutes). */
const MAX_TIMESTAMP_AGE_MS = 5 * 60 * 1000;

/** Signs a payload string with HMAC-SHA256, returning a `sha256=<hex>` signature. */
export function signPayload(payload: string, secret: string): string {
  const hmac = createHmac('sha256', secret).update(payload).digest('hex');
  return `sha256=${hmac}`;
}

/**
 * Signs a payload with a timestamp included in the HMAC computation.
 * The timestamp (Unix seconds) is prepended to the payload before signing.
 */
export function signPayloadWithTimestamp(payload: string, secret: string, timestamp: number): string {
  const message = `${timestamp}.${payload}`;
  const hmac = createHmac('sha256', secret).update(message).digest('hex');
  return `sha256=${hmac}`;
}

/** Verifies that a signature matches the expected HMAC-SHA256 digest of the payload. */
export function verifySignature(payload: string, secret: string, signature: string): boolean {
  const expected = signPayload(payload, secret);
  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(sigBuf, expectedBuf);
}

/**
 * Verifies a webhook signature with replay protection. Checks that the
 * timestamp is within the allowed window and includes it in the HMAC.
 *
 * @param payload - Raw request body
 * @param secret - HMAC shared secret
 * @param signature - `sha256=<hex>` signature from the request
 * @param timestamp - Unix timestamp (seconds) from the `X-Webhook-Timestamp` header
 * @returns `true` if valid, throws otherwise
 * @throws Error if the timestamp is missing, expired, or the signature is invalid
 */
export function verifySignatureWithTimestamp(
  payload: string,
  secret: string,
  signature: string,
  timestamp: number
): boolean {
  if (!timestamp || !Number.isFinite(timestamp)) {
    throw new Error('Missing or invalid webhook timestamp');
  }

  const nowMs = Date.now();
  const timestampMs = timestamp * 1000;
  const age = nowMs - timestampMs;

  if (age > MAX_TIMESTAMP_AGE_MS) {
    throw new Error(
      `Webhook timestamp too old: ${Math.round(age / 1000)}s ago (max ${MAX_TIMESTAMP_AGE_MS / 1000}s)`
    );
  }

  if (age < -MAX_TIMESTAMP_AGE_MS) {
    throw new Error('Webhook timestamp is in the future');
  }

  const message = `${timestamp}.${payload}`;
  const expected = signPayload(message, secret);
  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(sigBuf, expectedBuf);
}
