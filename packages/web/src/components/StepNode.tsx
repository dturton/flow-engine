import { Handle, Position, type NodeProps } from '@xyflow/react';

/**
 * Custom React Flow node representing a single step in the flow DAG.
 * Renders as a compact card (180px wide) with:
 * - Color-coded border based on execution status
 * - Step name and type badge
 * - Duration display and status indicator dot
 * - Connection handles for incoming (top) and outgoing (bottom) edges
 */

/** Maps step execution status to Tailwind border color classes */
const borderColors: Record<string, string> = {
  completed: 'border-green-400',
  failed: 'border-red-400',
  running: 'border-blue-400',
  pending: 'border-gray-300',
  queued: 'border-gray-300',
  cancelled: 'border-orange-400',
  retrying: 'border-yellow-400',
  skipped: 'border-gray-300',
};

/** Data shape passed to each StepNode via React Flow's node.data property */
export interface StepNodeData {
  label: string;
  type: string;
  status?: string;
  durationMs?: number;
  builderMode?: boolean;
  [key: string]: unknown;
}

export default function StepNode({ data, selected }: NodeProps) {
  const d = data as StepNodeData;
  const status = d.status ?? 'pending';
  const border = borderColors[status] ?? 'border-gray-300';

  return (
    <div
      className={`bg-white rounded-lg shadow px-3 py-2 border-2 ${border} ${selected ? 'ring-2 ring-blue-500' : ''}`}
      style={{ width: 180 }}
    >
      {/* Incoming edge connection point (dependencies flow into this step) */}
      <Handle type="target" position={Position.Top} className="!bg-gray-400 !w-2 !h-2" />

      {/* Step name — truncated if too long for the node width */}
      <div className="text-sm font-medium text-gray-800 truncate">{d.label}</div>

      <div className="flex items-center justify-between mt-1">
        {/* Step type badge (e.g. transform, action, branch) */}
        <span className="bg-purple-100 text-purple-700 text-[10px] px-1.5 py-0.5 rounded">{d.type}</span>
        {!d.builderMode && (
          <div className="flex items-center gap-1.5">
            {/* Execution duration (only shown after step completes) */}
            {d.durationMs != null && (
              <span className="text-[10px] text-gray-400">{d.durationMs}ms</span>
            )}
            {/* Status indicator dot — pulses when running */}
            <span className={`inline-block w-2 h-2 rounded-full ${status === 'completed' ? 'bg-green-400' : status === 'failed' ? 'bg-red-400' : status === 'running' ? 'bg-blue-400 animate-pulse' : status === 'cancelled' ? 'bg-orange-400' : status === 'retrying' ? 'bg-yellow-400' : 'bg-gray-300'}`} />
          </div>
        )}
      </div>

      {/* Outgoing edge connection point (dependent steps connect from here) */}
      <Handle type="source" position={Position.Bottom} className="!bg-gray-400 !w-2 !h-2" />
    </div>
  );
}
