import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { signPayload, verifySignature } from '../src/webhook-signature.js';

describe('signPayload', () => {
  it('returns a sha256= prefixed HMAC hex string', () => {
    const result = signPayload('hello', 'secret');
    expect(result).toMatch(/^sha256=[a-f0-9]{64}$/);
  });

  it('matches a manually computed HMAC-SHA256', () => {
    const payload = '{"order":123}';
    const secret = 'my-secret-key';
    const expectedHmac = createHmac('sha256', secret).update(payload).digest('hex');

    const result = signPayload(payload, secret);
    expect(result).toBe(`sha256=${expectedHmac}`);
  });

  it('produces different signatures for different payloads', () => {
    const sig1 = signPayload('payload1', 'secret');
    const sig2 = signPayload('payload2', 'secret');
    expect(sig1).not.toBe(sig2);
  });

  it('produces different signatures for different secrets', () => {
    const sig1 = signPayload('payload', 'secret1');
    const sig2 = signPayload('payload', 'secret2');
    expect(sig1).not.toBe(sig2);
  });
});

describe('verifySignature', () => {
  const payload = '{"event":"order.created","data":{"id":42}}';
  const secret = 'webhook-secret-abc123';

  it('returns true for a valid signature', () => {
    const signature = signPayload(payload, secret);
    expect(verifySignature(payload, secret, signature)).toBe(true);
  });

  it('returns false for an invalid signature', () => {
    expect(verifySignature(payload, secret, 'sha256=deadbeef')).toBe(false);
  });

  it('returns false for a signature without sha256= prefix', () => {
    const hmac = createHmac('sha256', secret).update(payload).digest('hex');
    expect(verifySignature(payload, secret, hmac)).toBe(false);
  });

  it('returns false when the payload has been tampered with', () => {
    const signature = signPayload(payload, secret);
    const tampered = payload.replace('42', '99');
    expect(verifySignature(tampered, secret, signature)).toBe(false);
  });

  it('returns false when the wrong secret is used to verify', () => {
    const signature = signPayload(payload, secret);
    expect(verifySignature(payload, 'wrong-secret', signature)).toBe(false);
  });

  it('returns false for an empty signature string', () => {
    expect(verifySignature(payload, secret, '')).toBe(false);
  });
});
