import { useCallback, useMemo, useRef } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Controls,
  Background,
  useReactFlow,
  type Node,
  type Edge,
  type Connection,
  type OnNodesDelete,
  type OnEdgesDelete,
} from '@xyflow/react';
import StepNode from '../StepNode.js';
import { layoutSteps } from './flowBuilderUtils.js';
import { hasCycle } from './flowBuilderUtils.js';
import type { FlowBuilderAction, StepDefinition, StepType } from './useFlowBuilderState.js';
import '@xyflow/react/dist/style.css';

const nodeTypes = { step: StepNode };

interface FlowBuilderCanvasProps {
  steps: StepDefinition[];
  selectedStepId: string | null;
  dispatch: React.Dispatch<FlowBuilderAction>;
}

function CanvasInner({ steps, selectedStepId, dispatch }: FlowBuilderCanvasProps) {
  const reactFlowInstance = useReactFlow();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  const { nodes, edges } = useMemo(
    () => layoutSteps(steps, selectedStepId, true),
    [steps, selectedStepId],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      if (connection.source === connection.target) return;
      if (hasCycle(steps, connection.source, connection.target)) return;
      dispatch({
        type: 'ADD_EDGE',
        payload: { sourceStepId: connection.source, targetStepId: connection.target },
      });
    },
    [steps, dispatch],
  );

  const onNodesDelete: OnNodesDelete = useCallback(
    (deleted: Node[]) => {
      for (const node of deleted) {
        dispatch({ type: 'DELETE_STEP', payload: { stepId: node.id } });
      }
    },
    [dispatch],
  );

  const onEdgesDelete: OnEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      for (const edge of deleted) {
        dispatch({
          type: 'DELETE_EDGE',
          payload: { sourceStepId: edge.source, targetStepId: edge.target },
        });
      }
    },
    [dispatch],
  );

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      dispatch({ type: 'SELECT_STEP', payload: { stepId: node.id } });
    },
    [dispatch],
  );

  const onPaneClick = useCallback(() => {
    dispatch({ type: 'SELECT_STEP', payload: { stepId: null } });
  }, [dispatch]);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const stepType = e.dataTransfer.getData('application/flow-step-type') as StepType;
      if (!stepType) return;
      dispatch({ type: 'ADD_STEP', payload: { stepType } });
    },
    [dispatch],
  );

  return (
    <div ref={reactFlowWrapper} className="flex-1 h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onConnect={onConnect}
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onDragOver={onDragOver}
        onDrop={onDrop}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable
        nodesConnectable
        deleteKeyCode="Backspace"
        zoomOnDoubleClick={false}
      >
        <Controls showInteractive={false} />
        <Background gap={16} size={1} />
      </ReactFlow>
    </div>
  );
}

export default function FlowBuilderCanvas(props: FlowBuilderCanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
