/**
 * Run detail page.
 * Shows the execution state of a single flow run: status, timing, error summary,
 * an interactive DAG graph with clickable step nodes, a slide-out step detail panel,
 * and expandable step-run cards with output and logs.
 * Auto-refreshes every 2s while the run is active (running/queued).
 * Supports cancelling active runs and replaying completed/failed ones.
 */

import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api, type FlowRunSummary, type FlowSummary } from '../api.js';
import StatusBadge from '../components/StatusBadge.js';
import FlowGraph from '../components/FlowGraph.js';
import StepDetailPanel from '../components/StepDetailPanel.js';

/** Detailed view of a single flow run with live updates, cancel, and replay */
export default function RunDetail() {
  const { runId } = useParams<{ runId: string }>();
  const [run, setRun] = useState<FlowRunSummary | null>(null);
  const [flow, setFlow] = useState<FlowSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [replaying, setReplaying] = useState(false);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!runId) return;
    api.getRun(runId)
      .then((r) => {
        setRun(r);
        return api.getFlow(r.flowId);
      })
      .then(setFlow)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [runId]);

  // Auto-refresh while run is active
  useEffect(() => {
    if (!runId || !run) return;
    if (run.status !== 'running' && run.status !== 'queued') return;
    const interval = setInterval(async () => {
      try {
        const updated = await api.getRun(runId);
        setRun(updated);
      } catch { /* ignore polling errors */ }
    }, 2000);
    return () => clearInterval(interval);
  }, [runId, run?.status]);

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

  const handleReplay = async () => {
    if (!run) return;
    setReplaying(true);
    setCancelError(null);
    try {
      await api.triggerFlow(run.flowId, { type: run.trigger.type, data: run.trigger.data });
      navigate(`/flows/${run.flowId}`);
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : 'Replay failed');
    } finally {
      setReplaying(false);
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
        <div className="text-right">
          <div className="flex gap-2">
            {(run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled') && (
              <button
                onClick={handleReplay}
                disabled={replaying}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
              >
                {replaying ? 'Replaying...' : 'Replay Run'}
              </button>
            )}
            {(run.status === 'running' || run.status === 'queued') && (
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 text-sm font-medium"
              >
                {cancelling ? 'Cancelling...' : 'Cancel Run'}
              </button>
            )}
          </div>
          {cancelError && (
            <p className="text-red-600 text-sm mt-1">{cancelError}</p>
          )}
        </div>
      </div>

      {/* Run-level error */}
      {run.error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-800 font-medium">Run failed at step: {run.error.stepId}</p>
          <p className="text-red-700 text-sm mt-1">{run.error.error.message}</p>
        </div>
      )}

      {/* Execution graph */}
      {flow && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3">Execution Graph</h2>
          <FlowGraph
            steps={flow.steps}
            stepRuns={run.stepRuns}
            onStepSelect={setSelectedStepId}
            selectedStepId={selectedStepId}
          />
        </section>
      )}

      {/* Step detail panel */}
      {selectedStepId && (
        <StepDetailPanel
          stepId={selectedStepId}
          stepRun={run.stepRuns[selectedStepId]}
          onClose={() => setSelectedStepId(null)}
        />
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

                {step.input && Object.keys(step.input).length > 0 && (
                  <details className="mt-2">
                    <summary className="text-sm text-gray-500 cursor-pointer hover:text-gray-700">Input</summary>
                    <pre className="mt-1 text-xs bg-gray-50 rounded p-2 overflow-x-auto">{JSON.stringify(step.input, null, 2)}</pre>
                  </details>
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
