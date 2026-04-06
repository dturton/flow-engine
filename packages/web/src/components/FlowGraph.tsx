import { useMemo, useCallback } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Controls,
  Background,
  type Node,
  type Edge,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import dagre from 'dagre';
import StepNode, { type StepNodeData } from './StepNode.js';
import '@xyflow/react/dist/style.css';

const NODE_WIDTH = 180;
const NODE_HEIGHT = 60;

const nodeTypes = { step: StepNode };

interface StepDef {
  id: string;
  name: string;
  type: string;
  dependsOn: string[];
}

interface StepRunData {
  stepId: string;
  status: string;
  attempt: number;
  durationMs?: number;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: { code: string; message: string; category: string; retryable: boolean };
  logs: { level: string; message: string; timestamp: string }[];
}

interface FlowGraphProps {
  steps: StepDef[];
  stepRuns?: Record<string, StepRunData>;
  onStepSelect?: (stepId: string | null) => void;
  selectedStepId?: string | null;
}

function layoutGraph(steps: StepDef[], stepRuns?: Record<string, StepRunData>) {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 60 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const step of steps) {
    g.setNode(step.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const step of steps) {
    for (const dep of step.dependsOn) {
      g.setEdge(dep, step.id);
    }
  }

  dagre.layout(g);

  const nodes: Node[] = steps.map((step) => {
    const pos = g.node(step.id);
    const run = stepRuns?.[step.id];
    return {
      id: step.id,
      type: 'step',
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
      data: {
        label: step.name,
        type: step.type,
        status: run?.status,
        durationMs: run?.durationMs,
      } satisfies StepNodeData,
    };
  });

  const edges: Edge[] = [];
  for (const step of steps) {
    for (const dep of step.dependsOn) {
      const sourceRun = stepRuns?.[dep];
      const targetRun = stepRuns?.[step.id];
      const isRunning = targetRun?.status === 'running' || sourceRun?.status === 'running';
      const isCompleted = sourceRun?.status === 'completed';

      edges.push({
        id: `${dep}->${step.id}`,
        source: dep,
        target: step.id,
        animated: isRunning,
        style: {
          stroke: isCompleted ? '#22c55e' : '#d1d5db',
          strokeDasharray: isRunning ? '5 5' : isCompleted ? undefined : '5 5',
          strokeWidth: 2,
        },
      });
    }
  }

  return { nodes, edges };
}

function FlowGraphInner({ steps, stepRuns, onStepSelect, selectedStepId }: FlowGraphProps) {
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => layoutGraph(steps, stepRuns),
    [steps, stepRuns],
  );

  const [nodes] = useNodesState(initialNodes);
  const [edges] = useEdgesState(initialEdges);

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      onStepSelect?.(node.id);
    },
    [onStepSelect],
  );

  const onPaneClick = useCallback(() => {
    onStepSelect?.(null);
  }, [onStepSelect]);

  return (
    <div className="bg-white rounded-lg shadow" style={{ height: 400 }}>
      <ReactFlow
        nodes={nodes.map((n) => ({ ...n, selected: n.id === selectedStepId }))}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        zoomOnDoubleClick={false}
      >
        <Controls showInteractive={false} />
        <Background gap={16} size={1} />
      </ReactFlow>
    </div>
  );
}

export default function FlowGraph(props: FlowGraphProps) {
  return (
    <ReactFlowProvider>
      <FlowGraphInner {...props} />
    </ReactFlowProvider>
  );
}
