import { useState } from 'react';
import StatusBadge from './StatusBadge.js';

/**
 * Slide-out panel that displays detailed execution data for a selected step.
 * Fixed to the right side of the viewport (400px wide, full height).
 * Shown when a user clicks a node in the FlowGraph component.
 *
 * Tabs:
 * - Overview: status, attempt count, duration, timestamps, error details
 * - Input: the resolved input data passed to the step (formatted JSON)
 * - Output: the data produced by the step (formatted JSON)
 * - Logs: timestamped, color-coded log entries from step execution
 */

/** Execution data for a single step within a flow run */
interface StepRun {
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
}

interface StepDetailPanelProps {
  stepId: string;
  /** Step run data — undefined if the step hasn't executed yet */
  stepRun?: StepRun;
  onClose: () => void;
}

type Tab = 'overview' | 'input' | 'output' | 'logs';

export default function StepDetailPanel({ stepId, stepRun, onClose }: StepDetailPanelProps) {
  const [tab, setTab] = useState<Tab>('overview');

  const tabs: Tab[] = ['overview', 'input', 'output', 'logs'];

  return (
    <div className="fixed top-0 right-0 h-full w-full md:w-[400px] bg-white shadow-xl border-l border-gray-200 z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-sm font-medium truncate">{stepId}</span>
          {stepRun && <StatusBadge status={stepRun.status} />}
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none ml-2" aria-label="Close step detail panel">&times;</button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 text-xs font-medium py-2 capitalize ${tab === t ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {!stepRun ? (
          <p className="text-gray-500 text-sm">No execution data for this step yet.</p>
        ) : tab === 'overview' ? (
          <div className="space-y-3 text-sm">
            <Row label="Status"><StatusBadge status={stepRun.status} /></Row>
            <Row label="Attempt">{stepRun.attempt}</Row>
            {stepRun.durationMs != null && <Row label="Duration">{stepRun.durationMs}ms</Row>}
            {stepRun.startedAt && <Row label="Started">{new Date(stepRun.startedAt).toLocaleString()}</Row>}
            {stepRun.completedAt && <Row label="Completed">{new Date(stepRun.completedAt).toLocaleString()}</Row>}
            {stepRun.error && (
              <div className="bg-red-50 rounded p-3 mt-2">
                <div className="text-red-700 font-medium">{stepRun.error.code}</div>
                <div className="text-red-600 mt-1">{stepRun.error.message}</div>
                <div className="text-gray-500 mt-1 text-xs">
                  {stepRun.error.category}{stepRun.error.retryable ? ' (retryable)' : ''}
                </div>
              </div>
            )}
          </div>
        ) : tab === 'input' ? (
          <pre className="text-xs bg-gray-50 rounded p-3 overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(stepRun.input, null, 2)}
          </pre>
        ) : tab === 'output' ? (
          stepRun.output ? (
            <pre className="text-xs bg-gray-50 rounded p-3 overflow-x-auto whitespace-pre-wrap">
              {JSON.stringify(stepRun.output, null, 2)}
            </pre>
          ) : (
            <p className="text-gray-500 text-sm">No output.</p>
          )
        ) : (
          stepRun.logs.length > 0 ? (
            <div className="space-y-1 font-mono text-xs">
              {stepRun.logs.map((log, i) => (
                <div key={i} className={`${log.level === 'error' ? 'text-red-600' : log.level === 'warn' ? 'text-yellow-600' : 'text-gray-600'}`}>
                  <span className="text-gray-400 mr-2">{new Date(log.timestamp).toLocaleTimeString()}</span>
                  <span className="font-medium">[{log.level}]</span> {log.message}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No logs.</p>
          )
        )}
      </div>
    </div>
  );
}

/** Simple label-value row used in the Overview tab */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-800">{children}</span>
    </div>
  );
}
