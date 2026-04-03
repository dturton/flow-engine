/**
 * Additional DagResolver tests covering: empty flow, duplicate step IDs,
 * multi-level depth graphs, and the validate() method directly.
 */
import { describe, it, expect } from 'vitest';
import { DagResolver } from '../src/engine/DagResolver.js';
import { FlowValidationError } from '../src/errors.js';
import type { FlowDefinition, StepDefinition } from '../src/types/flow.js';

function makeStep(id: string, dependsOn: string[] = []): StepDefinition {
  return {
    id,
    name: id,
    type: 'action',
    inputMapping: {},
    dependsOn,
  };
}

function makeFlow(steps: StepDefinition[]): FlowDefinition {
  return {
    id: 'flow-1',
    version: 1,
    name: 'Test Flow',
    tenantId: 'tenant-1',
    steps,
    errorPolicy: { onStepFailure: 'halt' },
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('DagResolver (additional)', () => {
  const resolver = new DagResolver();

  describe('empty flow', () => {
    it('resolves a flow with no steps without throwing', () => {
      const flow = makeFlow([]);
      const graph = resolver.resolve(flow);
      expect(graph.nodes.size).toBe(0);
      expect(graph.roots).toEqual([]);
      expect(graph.sortedOrder).toEqual([]);
    });
  });

  describe('duplicate step IDs', () => {
    it('throws FlowValidationError when two steps share the same id', () => {
      const flow = makeFlow([makeStep('A'), makeStep('A')]);
      expect(() => resolver.resolve(flow)).toThrow(FlowValidationError);
      expect(() => resolver.resolve(flow)).toThrow('Duplicate step ID: "A"');
    });

    it('validate() reports a duplicate-id issue with severity "error"', () => {
      const flow = makeFlow([makeStep('A'), makeStep('A')]);
      const issues = resolver.validate(flow);
      const errors = issues.filter((i) => i.severity === 'error');
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((i) => i.message.includes('Duplicate step ID'))).toBe(true);
    });
  });

  describe('multi-level depth assignment', () => {
    it('assigns correct depths for a 3-level chain', () => {
      // A(depth 0) → B(depth 1) → C(depth 2)
      const flow = makeFlow([makeStep('A'), makeStep('B', ['A']), makeStep('C', ['B'])]);
      const graph = resolver.resolve(flow);
      expect(graph.nodes.get('A')!.depth).toBe(0);
      expect(graph.nodes.get('B')!.depth).toBe(1);
      expect(graph.nodes.get('C')!.depth).toBe(2);
    });

    it('assigns the maximum depth when a step has multiple parents at different depths', () => {
      // A(0) → B(1) → D(2)
      //      ↗
      // C(0) ────────→ D
      // D depends on both B (depth 1) and C (depth 0), so D depth = 2
      const flow = makeFlow([
        makeStep('A'),
        makeStep('B', ['A']),
        makeStep('C'),
        makeStep('D', ['B', 'C']),
      ]);
      const graph = resolver.resolve(flow);
      expect(graph.nodes.get('D')!.depth).toBe(2);
    });
  });

  describe('dependents population', () => {
    it('populates the dependents set for each node', () => {
      const flow = makeFlow([makeStep('A'), makeStep('B', ['A']), makeStep('C', ['A'])]);
      const graph = resolver.resolve(flow);
      const aNode = graph.nodes.get('A')!;
      expect(aNode.dependents.has('B')).toBe(true);
      expect(aNode.dependents.has('C')).toBe(true);
    });
  });

  describe('roots list', () => {
    it('identifies all steps with no dependencies as roots', () => {
      const flow = makeFlow([makeStep('A'), makeStep('B'), makeStep('C', ['A', 'B'])]);
      const graph = resolver.resolve(flow);
      expect(graph.roots).toContain('A');
      expect(graph.roots).toContain('B');
      expect(graph.roots).not.toContain('C');
    });
  });

  describe('topological order', () => {
    it('includes every step in sortedOrder', () => {
      const flow = makeFlow([makeStep('A'), makeStep('B', ['A']), makeStep('C', ['B'])]);
      const graph = resolver.resolve(flow);
      expect(graph.sortedOrder).toHaveLength(3);
      expect(graph.sortedOrder).toContain('A');
      expect(graph.sortedOrder).toContain('B');
      expect(graph.sortedOrder).toContain('C');
    });

    it('sorts dependencies before dependents', () => {
      const flow = makeFlow([makeStep('A'), makeStep('B', ['A']), makeStep('C', ['B'])]);
      const graph = resolver.resolve(flow);
      const idxA = graph.sortedOrder.indexOf('A');
      const idxB = graph.sortedOrder.indexOf('B');
      const idxC = graph.sortedOrder.indexOf('C');
      expect(idxA).toBeLessThan(idxB);
      expect(idxB).toBeLessThan(idxC);
    });
  });

  describe('validate()', () => {
    it('returns an empty array for a valid flow', () => {
      const flow = makeFlow([makeStep('A'), makeStep('B', ['A'])]);
      expect(resolver.validate(flow)).toEqual([]);
    });

    it('reports missing dependency reference', () => {
      const flow = makeFlow([makeStep('B', ['non-existent'])]);
      const issues = resolver.validate(flow);
      expect(issues.some((i) => i.message.includes('non-existent'))).toBe(true);
    });

    it('reports cycle in addition to other issues when both exist', () => {
      // B depends on C and C depends on B (cycle) + B depends on missing step D
      const flow = makeFlow([makeStep('B', ['C', 'D']), makeStep('C', ['B'])]);
      const issues = resolver.validate(flow);
      const hasCycle = issues.some((i) => i.message.toLowerCase().includes('cycle'));
      const hasMissing = issues.some((i) => i.message.includes('D'));
      expect(hasCycle).toBe(true);
      expect(hasMissing).toBe(true);
    });
  });
});
