import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, type FlowSummary, type FlowRunSummary, type WebhookSummary } from '../api.js';
import StatusBadge from '../components/StatusBadge.js';
import FunctionEditor from '../components/FunctionEditor.js';
import FlowGraph from '../components/FlowGraph.js';

export default function FlowDetail() {
  const { flowId } = useParams<{ flowId: string }>();
  const [flow, setFlow] = useState<FlowSummary | null>(null);
  const [runs, setRuns] = useState<FlowRunSummary[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [triggerError, setTriggerError] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [creatingWebhook, setCreatingWebhook] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [runsPage, setRunsPage] = useState(0);
  const [runsTotal, setRunsTotal] = useState(0);
  const RUNS_PER_PAGE = 20;

  const fetchRuns = useCallback(async () => {
    if (!flowId) return;
    const result = await api.listRuns(flowId, {
      status: statusFilter || undefined,
      limit: RUNS_PER_PAGE,
      offset: runsPage * RUNS_PER_PAGE,
    });
    setRuns(result.runs);
    setRunsTotal(result.total);
  }, [flowId, statusFilter, runsPage]);

  useEffect(() => {
    if (!flowId) return;
    Promise.all([api.getFlow(flowId), api.listWebhooks(flowId)])
      .then(([f, w]) => { setFlow(f); setWebhooks(w); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [flowId]);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  const handleTrigger = async () => {
    if (!flowId) return;
    setTriggering(true);
    setTriggerError(null);
    try {
      await api.triggerFlow(flowId, { type: 'manual', data: {} });
      await fetchRuns();
    } catch (err) {
      setTriggerError(err instanceof Error ? err.message : 'Trigger failed');
    } finally {
      setTriggering(false);
    }
  };

  const handleCreateWebhook = async () => {
    if (!flowId) return;
    setCreatingWebhook(true);
    try {
      const webhook = await api.createWebhook(flowId);
      setWebhooks((prev) => [webhook, ...prev]);
    } catch (err) {
      setTriggerError(err instanceof Error ? err.message : 'Failed to create webhook');
    } finally {
      setCreatingWebhook(false);
    }
  };

  const handleDeleteWebhook = async (id: string) => {
    try {
      await api.deleteWebhook(id);
      setWebhooks((prev) => prev.filter((w) => w.id !== id));
    } catch (err) {
      setTriggerError(err instanceof Error ? err.message : 'Failed to delete webhook');
    }
  };

  const getWebhookUrl = useCallback((path: string) => {
    return `${window.location.origin}/webhooks/${path}`;
  }, []);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (loading) return <p className="text-gray-500">Loading...</p>;
  if (error) return <p className="text-red-600">Error: {error}</p>;
  if (!flow) return <p className="text-red-600">Flow not found</p>;

  return (
    <div>
      <div className="mb-6">
        <Link to="/flows" className="text-sm text-blue-600 hover:text-blue-800">&larr; Back to flows</Link>
      </div>

      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">{flow.name}</h1>
          {flow.description && <p className="text-gray-600 mt-1">{flow.description}</p>}
          <div className="flex gap-4 mt-2 text-sm text-gray-500">
            <span>Tenant: {flow.tenantId}</span>
            <span>Version: v{flow.version}</span>
            <span>Error policy: {flow.errorPolicy.onStepFailure}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="flex gap-2">
            <Link to={`/flows/${flowId}/edit`} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium">
              Edit
            </Link>
            <button
              onClick={handleTrigger}
              disabled={triggering}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
            >
              {triggering ? 'Triggering...' : 'Trigger Run'}
            </button>
          </div>
          {triggerError && (
            <p className="text-red-600 text-sm mt-1">{triggerError}</p>
          )}
        </div>
      </div>

      {/* Steps */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Steps ({flow.steps.length})</h2>
        <FlowGraph steps={flow.steps} />
        <details className="mt-4">
          <summary className="text-sm text-gray-500 cursor-pointer hover:text-gray-700">Step table</summary>
          <div className="bg-white rounded-lg shadow overflow-hidden mt-2">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Dependencies</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {flow.steps.map((step) => (
                  <tr key={step.id}>
                    <td className="px-6 py-3 text-sm font-mono text-gray-700">{step.id}</td>
                    <td className="px-6 py-3 text-sm">{step.name}</td>
                    <td className="px-6 py-3 text-sm">
                      <span className="bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded">{step.type}</span>
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-500">
                      {step.dependsOn.length > 0 ? step.dependsOn.join(', ') : 'none'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>

      {/* Functions */}
      {flow.functions && flow.functions.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3">Functions ({flow.functions.length})</h2>
          <div className="bg-white rounded-lg shadow p-4">
            <FunctionEditor
              functions={flow.functions}
              onChange={() => {}}
              readOnly
            />
          </div>
        </section>
      )}

      {/* Webhooks */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Webhooks ({webhooks.length})</h2>
          <button
            onClick={handleCreateWebhook}
            disabled={creatingWebhook}
            className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-xs font-medium"
          >
            {creatingWebhook ? 'Creating...' : '+ Create Webhook'}
          </button>
        </div>

        {webhooks.length === 0 ? (
          <p className="text-gray-500 text-sm">No webhooks configured. Create one to trigger this flow from external services.</p>
        ) : (
          <div className="space-y-3">
            {webhooks.map((wh) => (
              <div key={wh.id} className="bg-white rounded-lg shadow p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    {/* URL */}
                    <div className="mb-2">
                      <label className="block text-xs font-medium text-gray-500 mb-1">Webhook URL</label>
                      <div className="flex items-center gap-2">
                        <code className="text-sm bg-gray-100 px-2 py-1 rounded font-mono text-gray-800 truncate block flex-1">
                          {getWebhookUrl(wh.path)}
                        </code>
                        <button
                          onClick={() => copyToClipboard(getWebhookUrl(wh.path), `url-${wh.id}`)}
                          className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-gray-600 shrink-0"
                        >
                          {copiedId === `url-${wh.id}` ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                    </div>

                    {/* Secret */}
                    <div className="mb-2">
                      <label className="block text-xs font-medium text-gray-500 mb-1">Secret (for HMAC-SHA256 signature)</label>
                      <div className="flex items-center gap-2">
                        <code className="text-sm bg-gray-100 px-2 py-1 rounded font-mono text-gray-800 truncate block flex-1">
                          {wh.secret}
                        </code>
                        <button
                          onClick={() => copyToClipboard(wh.secret, `secret-${wh.id}`)}
                          className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-gray-600 shrink-0"
                        >
                          {copiedId === `secret-${wh.id}` ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                    </div>

                    {/* Usage hint */}
                    <p className="text-xs text-gray-400 mt-2">
                      POST any JSON to the URL above. Optionally sign with <code className="bg-gray-100 px-1 rounded">X-Webhook-Signature: sha256=hmac_hex</code>
                    </p>
                  </div>

                  <button
                    onClick={() => handleDeleteWebhook(wh.id)}
                    className="ml-4 text-gray-400 hover:text-red-500 text-sm shrink-0"
                    title="Delete webhook"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Runs */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Runs</h2>
          <div className="flex items-center gap-3">
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setRunsPage(0); }}
              className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white"
            >
              <option value="">All statuses</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="running">Running</option>
              <option value="queued">Queued</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <span className="text-sm text-gray-500">{runsTotal} total</span>
          </div>
        </div>
        {runs.length === 0 ? (
          <p className="text-gray-500">No runs yet.</p>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Run ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Trigger</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Started</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Completed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {runs.map((run) => (
                  <tr key={run.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 text-sm">
                      <Link to={`/runs/${run.id}`} className="text-blue-600 hover:text-blue-800 font-mono">
                        {run.id.slice(0, 12)}...
                      </Link>
                    </td>
                    <td className="px-6 py-3"><StatusBadge status={run.status} /></td>
                    <td className="px-6 py-3 text-sm text-gray-600">{run.trigger.type}</td>
                    <td className="px-6 py-3 text-sm text-gray-500">{new Date(run.startedAt).toLocaleString()}</td>
                    <td className="px-6 py-3 text-sm text-gray-500">
                      {run.completedAt ? new Date(run.completedAt).toLocaleString() : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {runsTotal > RUNS_PER_PAGE && (
          <div className="flex items-center justify-between mt-4">
            <button
              onClick={() => setRunsPage((p) => Math.max(0, p - 1))}
              disabled={runsPage === 0}
              className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="text-sm text-gray-500">
              Page {runsPage + 1} of {Math.ceil(runsTotal / RUNS_PER_PAGE)}
            </span>
            <button
              onClick={() => setRunsPage((p) => p + 1)}
              disabled={(runsPage + 1) * RUNS_PER_PAGE >= runsTotal}
              className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
