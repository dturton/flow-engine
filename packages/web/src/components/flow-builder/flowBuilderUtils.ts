import dagre from 'dagre';
import type { Node, Edge } from '@xyflow/react';
import type { StepNodeData } from '../StepNode.js';
import type { FlowBuilderState, StepDefinition } from './useFlowBuilderState.js';

const NODE_WIDTH = 180;
const NODE_HEIGHT = 60;

export interface LayoutResult {
  nodes: Node[];
  edges: Edge[];
}

export function layoutSteps(
  steps: StepDefinition[],
  selectedStepId?: string | null,
  builderMode = false,
): LayoutResult {
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
    return {
      id: step.id,
      type: 'step',
      position: {
        x: pos ? pos.x - NODE_WIDTH / 2 : 0,
        y: pos ? pos.y - NODE_HEIGHT / 2 : 0,
      },
      selected: step.id === selectedStepId,
      data: {
        label: step.name,
        type: step.type,
        builderMode,
      } satisfies StepNodeData,
    };
  });

  const edges: Edge[] = [];
  for (const step of steps) {
    for (const dep of step.dependsOn) {
      edges.push({
        id: `${dep}->${step.id}`,
        source: dep,
        target: step.id,
        style: { stroke: '#d1d5db', strokeWidth: 2 },
      });
    }
  }

  return { nodes, edges };
}

/**
 * Check if adding an edge from newSource → newTarget would create a cycle.
 * A cycle exists if newSource is already reachable from newTarget
 * by following existing forward edges (step → steps that depend on it).
 */
export function hasCycle(steps: StepDefinition[], newSource: string, newTarget: string): boolean {
  // Build forward adjacency: step → steps that depend on it
  const fwd = new Map<string, string[]>();
  for (const step of steps) {
    for (const dep of step.dependsOn) {
      const list = fwd.get(dep) ?? [];
      list.push(step.id);
      fwd.set(dep, list);
    }
  }

  // DFS: can we reach newSource starting from newTarget via forward edges?
  const visited = new Set<string>();
  const stack = [newTarget];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node === newSource) return true;
    if (visited.has(node)) continue;
    visited.add(node);
    for (const child of fwd.get(node) ?? []) {
      stack.push(child);
    }
  }

  return false;
}

export function stateToFlowDefinition(state: FlowBuilderState): Record<string, unknown> {
  const def: Record<string, unknown> = {
    name: state.name,
    tenantId: state.tenantId,
    steps: state.steps,
    errorPolicy: state.errorPolicy,
  };
  if (state.description) def.description = state.description;
  if (state.tags.length > 0) def.tags = state.tags;
  if (state.functions.length > 0) def.functions = state.functions;
  return def;
}
