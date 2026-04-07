/**
 * API client module.
 * Typed wrapper around fetch for all REST endpoints exposed by @flow-engine/api.
 * In dev mode, Vite proxies /api requests to the Fastify server on :3000.
 */

const BASE = '/api';

/** Generic fetch wrapper that prepends the base path, sets JSON headers, and throws on non-OK responses */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {};
  if (init?.body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, {
    headers,
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

/** Flow definition as returned by the API (dates serialized as ISO strings) */
export interface FlowSummary {
  id: string;
  name: string;
  version: number;
  tenantId: string;
  description?: string;
  tags?: string[];
  steps: { id: string; name: string; type: string; dependsOn: string[] }[];
  functions?: { name: string; params: string[]; body: string }[];
  errorPolicy: { onStepFailure: string; errorStepId?: string };
  createdAt: string;
  updatedAt: string;
}

/** Flow run with nested step-level execution details */
export interface FlowRunSummary {
  id: string;
  flowId: string;
  flowVersion: number;
  tenantId: string;
  status: string;
  trigger: { type: string; data: Record<string, unknown>; receivedAt: string };
  startedAt: string;
  completedAt?: string;
  stepRuns: Record<string, {
    stepId: string;
    status: string;
    attempt: number;
    startedAt?: string;
    completedAt?: string;
    durationMs?: number;
    input: Record<string, unknown>;
    output?: Record<string, unknown>;
    error?: { code: string; message: string; category: string; retryable: boolean };
    logs: { level: string; message: string; timestamp: string }[];
  }>;
  error?: { stepId: string; error: { code: string; message: string }; at: string };
}

/** Webhook configuration for triggering a flow via HTTP POST */
export interface WebhookSummary {
  id: string;
  flowId: string;
  path: string;
  secret: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Connection as returned by the API (credentials masked as ****) */
export interface ConnectionSummary {
  id: string;
  tenantId: string;
  connectorKey: string;
  name: string;
  description?: string;
  credentials: Record<string, string>;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** Typed API client with methods for each REST endpoint */
export const api = {
  /** Fetch all flow definitions */
  listFlows: () => request<FlowSummary[]>('/flows'),
  /** Fetch a single flow by ID */
  getFlow: (id: string) => request<FlowSummary>(`/flows/${id}`),
  /** Create a new flow definition */
  createFlow: (data: Record<string, unknown>) => request<FlowSummary>('/flows', { method: 'POST', body: JSON.stringify(data) }),
  /** Update an existing flow definition */
  updateFlow: (id: string, data: Record<string, unknown>) => request<FlowSummary>(`/flows/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  /** Delete a flow definition */
  deleteFlow: (id: string) => request<void>(`/flows/${id}`, { method: 'DELETE' }),
  /** Enqueue a flow execution job with the given trigger payload */
  triggerFlow: (id: string, trigger: { type: string; data: Record<string, unknown> }) =>
    request<{ jobId: string }>(`/flows/${id}/trigger`, { method: 'POST', body: JSON.stringify(trigger) }),
  /** List runs for a flow with optional status filter and pagination */
  listRuns: (flowId: string, opts?: { status?: string; limit?: number; offset?: number }) => {
    const params = new URLSearchParams();
    if (opts?.status) params.set('status', opts.status);
    if (opts?.limit) params.set('limit', String(opts.limit));
    if (opts?.offset) params.set('offset', String(opts.offset));
    const qs = params.toString();
    return request<{ runs: FlowRunSummary[]; total: number; limit: number; offset: number }>(`/flows/${flowId}/runs${qs ? `?${qs}` : ''}`);
  },
  /** Fetch a single run by ID */
  getRun: (runId: string) => request<FlowRunSummary>(`/runs/${runId}`),
  /** Request cancellation of an active run */
  cancelRun: (runId: string) => request<void>(`/runs/${runId}/cancel`, { method: 'POST' }),
  /** List webhooks configured for a flow */
  listWebhooks: (flowId: string) => request<WebhookSummary[]>(`/flows/${flowId}/webhooks`),
  /** Create a new webhook for a flow (generates path and HMAC secret) */
  createWebhook: (flowId: string) => request<WebhookSummary>(`/flows/${flowId}/webhooks`, { method: 'POST' }),
  /** Delete a webhook by ID */
  deleteWebhook: (id: string) => request<void>(`/webhooks/${id}`, { method: 'DELETE' }),
  /** Fetch the most recent runs across all flows */
  listRecentRuns: (limit?: number) => request<FlowRunSummary[]>(`/runs${limit ? `?limit=${limit}` : ''}`),
  /** List connections for a tenant, optionally filtered by connector key */
  listConnections: (tenantId: string, connectorKey?: string) => {
    const params = new URLSearchParams({ tenantId });
    if (connectorKey) params.set('connectorKey', connectorKey);
    return request<ConnectionSummary[]>(`/connections?${params}`);
  },
  /** Create a new connection */
  createConnection: (data: {
    tenantId: string;
    connectorKey: string;
    name: string;
    description?: string;
    credentials: Record<string, unknown>;
    config?: Record<string, unknown>;
  }) => request<ConnectionSummary>('/connections', { method: 'POST', body: JSON.stringify(data) }),
  /** Test a connection's credentials */
  testConnection: (id: string) =>
    request<{ success: boolean; message?: string; error?: string; details?: Record<string, unknown> }>(
      `/connections/${id}/test`, { method: 'POST' },
    ),
  /** Delete a connection */
  deleteConnection: (id: string) => request<void>(`/connections/${id}`, { method: 'DELETE' }),
};
