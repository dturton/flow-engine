import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, type FlowSummary, type FlowRunSummary } from '../api.js';
import StatusBadge from '../components/StatusBadge.js';
import FunctionEditor from '../components/FunctionEditor.js';

export default function FlowDetail() {
  const { flowId } = useParams<{ flowId: string }>();
  const [flow, setFlow] = useState<FlowSummary | null>(null);
  const [runs, setRuns] = useState<FlowRunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [triggerError, setTriggerError] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);

  useEffect(() => {
    if (!flowId) return;
    Promise.all([api.getFlow(flowId), api.listRuns(flowId)])
      .then(([f, r]) => { setFlow(f); setRuns(r); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [flowId]);

  const handleTrigger = async () => {
    if (!flowId) return;
    setTriggering(true);
    setTriggerError(null);
    try {
      await api.triggerFlow(flowId, { type: 'manual', data: {} });
      const updatedRuns = await api.listRuns(flowId);
      setRuns(updatedRuns);
    } catch (err) {
      setTriggerError(err instanceof Error ? err.message : 'Trigger failed');
    } finally {
      setTriggering(false);
    }
  };

  if (loading) return <p className="text-gray-500">Loading...</p>;
  if (error) return <p className="text-red-600">Error: {error}</p>;
  if (!flow) return <p className="text-red-600">Flow not found</p>;

  return (
    <div>
      <div className="mb-6">
        <Link to="/" className="text-sm text-blue-600 hover:text-blue-800">&larr; Back to flows</Link>
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
          <button
            onClick={handleTrigger}
            disabled={triggering}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
          >
            {triggering ? 'Triggering...' : 'Trigger Run'}
          </button>
          {triggerError && (
            <p className="text-red-600 text-sm mt-1">{triggerError}</p>
          )}
        </div>
      </div>

      {/* Steps */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Steps ({flow.steps.length})</h2>
        <div className="bg-white rounded-lg shadow overflow-hidden">
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

      {/* Runs */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Recent Runs</h2>
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
      </section>
    </div>
  );
}
