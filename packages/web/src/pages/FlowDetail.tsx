import { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api, type FlowSummary, type FlowRunSummary, type WebhookSummary } from '../api.js';
import StatusBadge from '../components/StatusBadge.js';
import FunctionEditor from '../components/FunctionEditor.js';
import FlowGraph from '../components/FlowGraph.js';
import LoadingSpinner from '../components/LoadingSpinner.js';
import Breadcrumb from '../components/Breadcrumb.js';
import ConfirmDialog from '../components/ui/ConfirmDialog.js';
import Button from '../components/ui/Button.js';
import { useToast } from '../contexts/ToastContext.js';

export default function FlowDetail() {
  const { flowId } = useParams<{ flowId: string }>();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [flow, setFlow] = useState<FlowSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [runs, setRuns] = useState<FlowRunSummary[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
    const controller = new AbortController();
    Promise.all([api.getFlow(flowId), api.listWebhooks(flowId)])
      .then(([f, w]) => {
        if (!controller.signal.aborted) { setFlow(f); setWebhooks(w); }
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [flowId]);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  const [pollUntil, setPollUntil] = useState(0);

  const handleTrigger = async () => {
    if (!flowId) return;
    setTriggering(true);
    try {
      const { jobId } = await api.triggerFlow(flowId, { type: 'manual', data: {} });
      addToast(`Run queued (${jobId})`, 'success');
      setPollUntil(Date.now() + 30_000);
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Trigger failed', 'error');
    } finally {
      setTriggering(false);
    }
  };

  useEffect(() => {
    const hasActive = runs.some((r) => r.status === 'running' || r.status === 'queued');
    const shouldPoll = hasActive || Date.now() < pollUntil;
    if (!shouldPoll) return;
    const interval = setInterval(() => {
      fetchRuns();
      if (!hasActive && Date.now() >= pollUntil) {
        setPollUntil(0);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [runs, fetchRuns, pollUntil]);

  const handleCreateWebhook = async () => {
    if (!flowId) return;
    setCreatingWebhook(true);
    try {
      const webhook = await api.createWebhook(flowId);
      setWebhooks((prev) => [webhook, ...prev]);
      addToast('Webhook created', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to create webhook', 'error');
    } finally {
      setCreatingWebhook(false);
    }
  };

  const handleDeleteWebhook = async (id: string) => {
    try {
      await api.deleteWebhook(id);
      setWebhooks((prev) => prev.filter((w) => w.id !== id));
      addToast('Webhook deleted', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to delete webhook', 'error');
    }
  };

  const handleDeleteFlow = async () => {
    if (!flowId) return;
    setDeleting(true);
    try {
      await api.deleteFlow(flowId);
      navigate('/flows');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Delete failed', 'error');
      setDeleting(false);
      setConfirmDelete(false);
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

  if (loading) return <div className="flex justify-center py-12"><LoadingSpinner size="lg" /></div>;
  if (error) return <p className="text-red-600" role="alert">Error: {error}</p>;
  if (!flow) return <p className="text-red-600" role="alert">Flow not found</p>;

  return (
    <div>
      <Breadcrumb items={[
        { label: 'Flows', href: '/flows' },
        { label: flow.name },
      ]} />

      <ConfirmDialog
        open={confirmDelete}
        title="Delete Flow"
        message="Are you sure you want to delete this flow? This cannot be undone."
        confirmLabel="Delete"
        onConfirm={handleDeleteFlow}
        onCancel={() => setConfirmDelete(false)}
        loading={deleting}
      />

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
        <div className="flex gap-2">
          <Button
            variant="danger"
            size="sm"
            onClick={() => setConfirmDelete(true)}
            disabled={deleting}
            className="bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700"
          >
            Delete
          </Button>
          <Link to={`/flows/${flowId}/edit`} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium">
            Edit
          </Link>
          <Button onClick={handleTrigger} loading={triggering}>
            Trigger Run
          </Button>
        </div>
      </div>

      {/* Steps */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Steps ({flow.steps.length})</h2>
        <FlowGraph steps={flow.steps} />
        <details className="mt-4">
          <summary className="text-sm text-gray-500 cursor-pointer hover:text-gray-700">Step table</summary>
          <div className="bg-white rounded-lg shadow overflow-hidden mt-2">
            <div className="overflow-x-auto">
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
          <Button size="sm" onClick={handleCreateWebhook} loading={creatingWebhook} className="bg-green-600 hover:bg-green-700 focus:ring-green-500">
            + Create Webhook
          </Button>
        </div>

        {webhooks.length === 0 ? (
          <p className="text-gray-500 text-sm">No webhooks configured. Create one to trigger this flow from external services.</p>
        ) : (
          <div className="space-y-3">
            {webhooks.map((wh) => (
              <div key={wh.id} className="bg-white rounded-lg shadow p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="mb-2">
                      <label className="block text-xs font-medium text-gray-500 mb-1">Webhook URL</label>
                      <div className="flex items-center gap-2">
                        <code className="text-sm bg-gray-100 px-2 py-1 rounded font-mono text-gray-800 truncate block flex-1">
                          {getWebhookUrl(wh.path)}
                        </code>
                        <button
                          onClick={() => copyToClipboard(getWebhookUrl(wh.path), `url-${wh.id}`)}
                          className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-gray-600 shrink-0"
                          aria-label="Copy webhook URL"
                        >
                          {copiedId === `url-${wh.id}` ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                    </div>

                    <div className="mb-2">
                      <label className="block text-xs font-medium text-gray-500 mb-1">Secret (for HMAC-SHA256 signature)</label>
                      <div className="flex items-center gap-2">
                        <code className="text-sm bg-gray-100 px-2 py-1 rounded font-mono text-gray-800 truncate block flex-1">
                          {wh.secret}
                        </code>
                        <button
                          onClick={() => copyToClipboard(wh.secret, `secret-${wh.id}`)}
                          className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-gray-600 shrink-0"
                          aria-label="Copy webhook secret"
                        >
                          {copiedId === `secret-${wh.id}` ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                    </div>

                    <p className="text-xs text-gray-400 mt-2">
                      POST any JSON to the URL above. Optionally sign with <code className="bg-gray-100 px-1 rounded">X-Webhook-Signature: sha256=hmac_hex</code>
                    </p>
                  </div>

                  <button
                    onClick={() => handleDeleteWebhook(wh.id)}
                    className="ml-4 text-gray-400 hover:text-red-500 text-sm shrink-0"
                    aria-label={`Delete webhook ${wh.path}`}
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
            <label htmlFor="status-filter" className="sr-only">Filter by status</label>
            <select
              id="status-filter"
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
            <div className="overflow-x-auto">
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
