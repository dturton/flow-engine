/**
 * Generic HTTP connector that makes raw fetch requests. Unlike
 * {@link BaseConnector} subclasses, this connector ignores the operation ID
 * and simply forwards url/method/headers/body from the step inputs.
 * Useful for one-off HTTP calls in flows without a dedicated connector.
 */

import type { Connector } from '@flow-engine/core';
import { validateUrl } from '../utils/url-validator.js';

/** Default request timeout in milliseconds. */
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Stateless HTTP connector — sends a single request per execution using
 * the url, method, headers, and body provided in step inputs.
 */
export class HttpConnector implements Connector {
  async execute(_operationId: string, inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const url = inputs.url as string;
    if (!url) throw new Error('HttpConnector requires a "url" input');

    // SSRF protection: validate URL before making the request
    await validateUrl(url);

    const method = ((inputs.method as string) ?? 'GET').toUpperCase();
    const headers = (inputs.headers as Record<string, string>) ?? {};
    const body = inputs.body;
    const timeoutMs = typeof inputs.timeoutMs === 'number' ? inputs.timeoutMs : DEFAULT_TIMEOUT_MS;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const init: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      signal: controller.signal,
    };

    if (body && method !== 'GET' && method !== 'HEAD') {
      init.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    try {
      const response = await fetch(url, init);

      let responseBody: unknown;
      try {
        responseBody = await response.json();
      } catch {
        responseBody = await response.text();
      }

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status} ${response.statusText}: ${typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody)}`
        );
      }

      return {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body: responseBody,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
