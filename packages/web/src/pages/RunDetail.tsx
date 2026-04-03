import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, type FlowRunSummary } from '../api.js';
import StatusBadge from '../components/StatusBadge.js';

export default function RunDetail() {
  const { runId } = useParams<{ runId: string }>();
  const [run, setRun] = useState<FlowRunSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (!runId) return;
    api.getRun(runId)
      .then(setRun)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [runId]);

  const handleCancel = async () => {
    if (!runId) return;
    setCancelling(true);
    setCancelError(null);
    try {
      await api.cancelRun(runId);
      const updated = await api.getRun(runId);
      setRun(updated);
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : 'Cancel failed');
    } finally {
      setCancelling(false);
    }
  };

  if (loading) return <p className="text-gray-500">Loading...</p>;
  if (error) return <p className="text-red-600">Error: {error}</p>;
  if (!run) return <p className="text-red-600">Run not found</p>;

  const stepEntries = Object.values(run.stepRuns);

  return (
    <div>
      <div className="mb-6">
        <Link to={`/flows/${run.flowId}`} className="text-sm text-blue-600 hover:text-blue-800">&larr; Back to flow</Link>
      </div>

      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold font-mono">{run.id}</h1>
          <div className="flex items-center gap-4 mt-2">
            <StatusBadge status={run.status} />
            <span className="text-sm text-gray-500">Flow: {run.flowId}</span>
            <span className="text-sm text-gray-500">v{run.flowVersion}</span>
            <span className="text-sm text-gray-500">Trigger: {run.trigger.type}</span>
          </div>
          <div className="flex gap-4 mt-1 text-sm text-gray-500">
            <span>Started: {new Date(run.startedAt).toLocaleString()}</span>
            {run.completedAt && <span>Completed: {new Date(run.completedAt).toLocaleString()}</span>}
          </div>
        </div>
        {(run.status === 'running' || run.status === 'queued') && (
          <div className="text-right">
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 text-sm font-medium"
            >
              {cancelling ? 'Cancelling...' : 'Cancel Run'}
            </button>
            {cancelError && (
              <p className="text-red-600 text-sm mt-1">{cancelError}</p>
            )}
          </div>
        )}
      </div>

      {/* Run-level error */}
      {run.error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-800 font-medium">Run failed at step: {run.error.stepId}</p>
          <p className="text-red-700 text-sm mt-1">{run.error.error.message}</p>
        </div>
      )}

      {/* Step runs */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Step Runs ({stepEntries.length})</h2>
        {stepEntries.length === 0 ? (
          <p className="text-gray-500">No steps have executed yet.</p>
        ) : (
          <div className="space-y-4">
            {stepEntries.map((step) => (
              <div key={step.stepId} className="bg-white rounded-lg shadow p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-medium">{step.stepId}</span>
                    <StatusBadge status={step.status} />
                  </div>
                  <div className="text-sm text-gray-500">
                    Attempt {step.attempt}
                    {step.durationMs != null && <span className="ml-3">{step.durationMs}ms</span>}
                  </div>
                </div>

                {step.error && (
                  <div className="bg-red-50 rounded p-3 mt-2 text-sm">
                    <span className="text-red-700 font-medium">{step.error.code}</span>
                    <span className="text-red-600 ml-2">{step.error.message}</span>
                    <span className="text-gray-500 ml-2">({step.error.category}{step.error.retryable ? ', retryable' : ''})</span>
                  </div>
                )}

                {step.output && (
                  <details className="mt-2">
                    <summary className="text-sm text-gray-500 cursor-pointer hover:text-gray-700">Output</summary>
                    <pre className="mt-1 text-xs bg-gray-50 rounded p-2 overflow-x-auto">{JSON.stringify(step.output, null, 2)}</pre>
                  </details>
                )}

                {step.logs.length > 0 && (
                  <details className="mt-2">
                    <summary className="text-sm text-gray-500 cursor-pointer hover:text-gray-700">Logs ({step.logs.length})</summary>
                    <div className="mt-1 text-xs bg-gray-50 rounded p-2 max-h-48 overflow-y-auto font-mono">
                      {step.logs.map((log, i) => (
                        <div key={i} className={`${log.level === 'error' ? 'text-red-600' : log.level === 'warn' ? 'text-yellow-600' : 'text-gray-600'}`}>
                          [{log.level}] {log.message}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
