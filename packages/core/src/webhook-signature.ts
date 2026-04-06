/**
 * HMAC-SHA256 webhook signature utilities.
 * Used to sign outgoing webhook payloads and verify incoming webhook requests,
 * following the `sha256=<hex>` convention (similar to GitHub webhook signatures).
 */

import { createHmac } from 'node:crypto';

/** Signs a payload string with HMAC-SHA256, returning a `sha256=<hex>` signature. */
export function signPayload(payload: string, secret: string): string {
  const hmac = createHmac('sha256', secret).update(payload).digest('hex');
  return `sha256=${hmac}`;
}

/** Verifies that a signature matches the expected HMAC-SHA256 digest of the payload. */
export function verifySignature(payload: string, secret: string, signature: string): boolean {
  const expected = signPayload(payload, secret);
  return signature === expected;
}
