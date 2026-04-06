const BASE = '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

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

export const api = {
  listFlows: () => request<FlowSummary[]>('/flows'),
  getFlow: (id: string) => request<FlowSummary>(`/flows/${id}`),
  createFlow: (data: Record<string, unknown>) => request<FlowSummary>('/flows', { method: 'POST', body: JSON.stringify(data) }),
  deleteFlow: (id: string) => request<void>(`/flows/${id}`, { method: 'DELETE' }),
  triggerFlow: (id: string, trigger: { type: string; data: Record<string, unknown> }) =>
    request<{ jobId: string }>(`/flows/${id}/trigger`, { method: 'POST', body: JSON.stringify(trigger) }),
  listRuns: (flowId: string) => request<FlowRunSummary[]>(`/flows/${flowId}/runs`),
  getRun: (runId: string) => request<FlowRunSummary>(`/runs/${runId}`),
  cancelRun: (runId: string) => request<void>(`/runs/${runId}/cancel`, { method: 'POST' }),
};
