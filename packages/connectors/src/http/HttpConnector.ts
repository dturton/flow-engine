/**
 * Generic HTTP connector that makes raw fetch requests. Unlike
 * {@link BaseConnector} subclasses, this connector ignores the operation ID
 * and simply forwards url/method/headers/body from the step inputs.
 * Useful for one-off HTTP calls in flows without a dedicated connector.
 */

import type { Connector } from '@flow-engine/core';

/**
 * Stateless HTTP connector — sends a single request per execution using
 * the url, method, headers, and body provided in step inputs.
 */
export class HttpConnector implements Connector {
  async execute(_operationId: string, inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const url = inputs.url as string;
    if (!url) throw new Error('HttpConnector requires a "url" input');

    const method = ((inputs.method as string) ?? 'GET').toUpperCase();
    const headers = (inputs.headers as Record<string, string>) ?? {};
    const body = inputs.body;

    const init: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
    };

    if (body && method !== 'GET' && method !== 'HEAD') {
      init.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    const response = await fetch(url, init);
    const contentType = response.headers.get('content-type') ?? '';
    const responseBody = contentType.includes('application/json')
      ? await response.json()
      : await response.text();

    return {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      body: responseBody,
    };
  }
}
