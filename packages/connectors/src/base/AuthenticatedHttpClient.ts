import type { AuthConfig, HttpConnectorConfig } from './types.js';
import { classifyHttpError } from './error-classifier.js';

export interface HttpResponse<T = unknown> {
  status: number;
  data: T;
  headers: Record<string, string>;
}

export class AuthenticatedHttpClient {
  private readonly baseUrl: string;
  private readonly auth: AuthConfig;
  private readonly defaultHeaders: Record<string, string>;
  private readonly timeoutMs: number;

  constructor(config: HttpConnectorConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.auth = config.auth;
    this.defaultHeaders = config.defaultHeaders ?? {};
    this.timeoutMs = config.timeoutMs ?? 30_000;
  }

  async request<T = unknown>(
    method: string,
    path: string,
    options?: {
      body?: unknown;
      headers?: Record<string, string>;
      query?: Record<string, string>;
    },
  ): Promise<HttpResponse<T>> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (options?.query) {
      for (const [k, v] of Object.entries(options.query)) {
        if (v !== undefined) url.searchParams.set(k, v);
      }
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...this.defaultHeaders,
      ...this.buildAuthHeaders(),
      ...options?.headers,
    };

    const init: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(this.timeoutMs),
    };

    if (options?.body && method !== 'GET' && method !== 'HEAD') {
      init.body = JSON.stringify(options.body);
    }

    const response = await fetch(url.toString(), init);

    if (!response.ok) {
      const body = await response.text();
      throw classifyHttpError(response.status, body, path);
    }

    const contentType = response.headers.get('content-type') ?? '';
    const data = contentType.includes('application/json')
      ? ((await response.json()) as T)
      : ((await response.text()) as unknown as T);

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((v, k) => {
      responseHeaders[k] = v;
    });

    return { status: response.status, data, headers: responseHeaders };
  }

  async get<T = unknown>(path: string, query?: Record<string, string>): Promise<HttpResponse<T>> {
    return this.request<T>('GET', path, { query });
  }

  async post<T = unknown>(path: string, body: unknown): Promise<HttpResponse<T>> {
    return this.request<T>('POST', path, { body });
  }

  async put<T = unknown>(path: string, body: unknown): Promise<HttpResponse<T>> {
    return this.request<T>('PUT', path, { body });
  }

  async delete<T = unknown>(path: string): Promise<HttpResponse<T>> {
    return this.request<T>('DELETE', path);
  }

  private buildAuthHeaders(): Record<string, string> {
    switch (this.auth.type) {
      case 'header':
        return { [this.auth.headerName]: this.auth.value };
      case 'bearer':
        return { Authorization: `Bearer ${this.auth.token}` };
      case 'basic':
        return {
          Authorization: `Basic ${Buffer.from(`${this.auth.username}:${this.auth.password}`).toString('base64')}`,
        };
      case 'none':
        return {};
    }
  }
}
