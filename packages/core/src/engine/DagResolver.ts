import type { FlowDefinition, StepDefinition } from '../types/flow.js';
import { FlowValidationError } from '../errors.js';

export interface ExecutionNode {
  stepId: string;
  depth: number;
  dependencies: Set<string>;
  dependents: Set<string>;
}

export interface ExecutionGraph {
  nodes: Map<string, ExecutionNode>;
  roots: string[];
  sortedOrder: string[];
}

export interface ValidationIssue {
  stepId?: string;
  severity: 'error' | 'warning';
  message: string;
}

export class DagResolver {
  resolve(flow: FlowDefinition): ExecutionGraph {
    const issues = this.validate(flow);
    const errors = issues.filter((i) => i.severity === 'error');
    if (errors.length > 0) {
      throw new FlowValidationError(
        `Flow validation failed: ${errors.map((e) => e.message).join('; ')}`
      );
    }

    const stepMap = new Map(flow.steps.map((s) => [s.id, s]));
    const adj = this.buildAdjacency(flow.steps);

    const nodes = new Map<string, ExecutionNode>();
    for (const step of flow.steps) {
      nodes.set(step.id, {
        stepId: step.id,
        depth: 0,
        dependencies: new Set(step.dependsOn),
        dependents: new Set<string>(),
      });
    }

    // Populate dependents
    for (const step of flow.steps) {
      for (const dep of step.dependsOn) {
        nodes.get(dep)!.dependents.add(step.id);
      }
    }

    // Compute depths via BFS from roots
    const roots = flow.steps.filter((s) => s.dependsOn.length === 0).map((s) => s.id);
    const visited = new Set<string>();
    const queue: Array<{ id: string; depth: number }> = roots.map((id) => ({ id, depth: 0 }));

    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;
      const node = nodes.get(id)!;
      if (depth > node.depth) {
        node.depth = depth;
      }
      if (visited.has(id)) continue;
      visited.add(id);
      for (const dependent of node.dependents) {
        queue.push({ id: dependent, depth: depth + 1 });
      }
    }

    const sortedOrder = this.topologicalSort(nodes);

    return { nodes, roots, sortedOrder };
  }

  validate(flow: FlowDefinition): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const stepIds = new Set(flow.steps.map((s) => s.id));

    // Check duplicate step IDs
    const seen = new Set<string>();
    for (const step of flow.steps) {
      if (seen.has(step.id)) {
        issues.push({
          stepId: step.id,
          severity: 'error',
          message: `Duplicate step ID: "${step.id}"`,
        });
      }
      seen.add(step.id);
    }

    // Check missing dependsOn references
    for (const step of flow.steps) {
      for (const dep of step.dependsOn) {
        if (!stepIds.has(dep)) {
          issues.push({
            stepId: step.id,
            severity: 'error',
            message: `Step "${step.id}" depends on non-existent step "${dep}"`,
          });
        }
      }
    }

    // Check cycles
    const adj = this.buildAdjacency(flow.steps);
    const cycles = this.detectCycles(adj);
    for (const cycle of cycles) {
      issues.push({
        severity: 'error',
        message: `Cycle detected: ${cycle.join(' → ')}`,
      });
    }

    return issues;
  }

  private buildAdjacency(steps: StepDefinition[]): Map<string, Set<string>> {
    const adj = new Map<string, Set<string>>();
    for (const step of steps) {
      if (!adj.has(step.id)) {
        adj.set(step.id, new Set());
      }
      for (const dep of step.dependsOn) {
        if (!adj.has(dep)) {
          adj.set(dep, new Set());
        }
        adj.get(dep)!.add(step.id);
      }
    }
    return adj;
  }

  private topologicalSort(nodes: Map<string, ExecutionNode>): string[] {
    const inDegree = new Map<string, number>();
    for (const [id, node] of nodes) {
      inDegree.set(id, node.dependencies.size);
    }

    const queue: string[] = [];
    for (const [id, degree] of inDegree) {
      if (degree === 0) queue.push(id);
    }

    const sorted: string[] = [];
    while (queue.length > 0) {
      const id = queue.shift()!;
      sorted.push(id);
      const node = nodes.get(id)!;
      for (const dependent of node.dependents) {
        const newDegree = inDegree.get(dependent)! - 1;
        inDegree.set(dependent, newDegree);
        if (newDegree === 0) {
          queue.push(dependent);
        }
      }
    }

    return sorted;
  }

  private detectCycles(adj: Map<string, Set<string>>): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const inStack = new Set<string>();
    const path: string[] = [];

    const dfs = (node: string): void => {
      if (inStack.has(node)) {
        const cycleStart = path.indexOf(node);
        cycles.push([...path.slice(cycleStart), node]);
        return;
      }
      if (visited.has(node)) return;

      visited.add(node);
      inStack.add(node);
      path.push(node);

      const neighbors = adj.get(node) ?? new Set();
      for (const neighbor of neighbors) {
        dfs(neighbor);
      }

      path.pop();
      inStack.delete(node);
    };

    for (const node of adj.keys()) {
      dfs(node);
    }

    return cycles;
  }
}
