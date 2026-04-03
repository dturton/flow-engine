import { describe, it, expect } from 'vitest';
import { DagResolver } from '../src/engine/DagResolver.js';
import { FlowValidationError } from '../src/errors.js';
import type { FlowDefinition, StepDefinition } from '../src/types/flow.js';

function makeFlow(steps: Partial<StepDefinition>[]): FlowDefinition {
  return {
    id: 'test-flow',
    version: 1,
    name: 'Test Flow',
    tenantId: 'tenant-1',
    steps: steps.map((s) => ({
      id: s.id ?? 'step',
      name: s.name ?? s.id ?? 'step',
      type: s.type ?? 'action',
      inputMapping: s.inputMapping ?? {},
      dependsOn: s.dependsOn ?? [],
      ...s,
    })) as StepDefinition[],
    errorPolicy: { onStepFailure: 'halt' },
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('DagResolver', () => {
  const resolver = new DagResolver();

  it('resolves a simple linear chain A → B → C correctly', () => {
    const flow = makeFlow([
      { id: 'A', dependsOn: [] },
      { id: 'B', dependsOn: ['A'] },
      { id: 'C', dependsOn: ['B'] },
    ]);

    const graph = resolver.resolve(flow);

    expect(graph.roots).toEqual(['A']);
    expect(graph.sortedOrder).toEqual(['A', 'B', 'C']);
    expect(graph.nodes.get('A')!.depth).toBe(0);
    expect(graph.nodes.get('B')!.depth).toBe(1);
    expect(graph.nodes.get('C')!.depth).toBe(2);
  });

  it('resolves a diamond dependency and identifies B and C as depth-1 siblings', () => {
    const flow = makeFlow([
      { id: 'A', dependsOn: [] },
      { id: 'B', dependsOn: ['A'] },
      { id: 'C', dependsOn: ['A'] },
      { id: 'D', dependsOn: ['B', 'C'] },
    ]);

    const graph = resolver.resolve(flow);

    expect(graph.roots).toEqual(['A']);
    expect(graph.nodes.get('B')!.depth).toBe(1);
    expect(graph.nodes.get('C')!.depth).toBe(1);
    expect(graph.nodes.get('D')!.depth).toBe(2);
    // B and C should both appear before D in sorted order
    const bIdx = graph.sortedOrder.indexOf('B');
    const cIdx = graph.sortedOrder.indexOf('C');
    const dIdx = graph.sortedOrder.indexOf('D');
    expect(bIdx).toBeLessThan(dIdx);
    expect(cIdx).toBeLessThan(dIdx);
  });

  it('throws FlowValidationError on a direct cycle (A depends on B, B depends on A)', () => {
    const flow = makeFlow([
      { id: 'A', dependsOn: ['B'] },
      { id: 'B', dependsOn: ['A'] },
    ]);

    expect(() => resolver.resolve(flow)).toThrow(FlowValidationError);
  });

  it('throws FlowValidationError when dependsOn references a non-existent step ID', () => {
    const flow = makeFlow([
      { id: 'A', dependsOn: ['Z'] },
    ]);

    expect(() => resolver.resolve(flow)).toThrow(FlowValidationError);
  });

  it('returns an empty graph for a flow with a single step and no dependencies', () => {
    const flow = makeFlow([
      { id: 'A', dependsOn: [] },
    ]);

    const graph = resolver.resolve(flow);

    expect(graph.roots).toEqual(['A']);
    expect(graph.sortedOrder).toEqual(['A']);
    expect(graph.nodes.size).toBe(1);
    expect(graph.nodes.get('A')!.depth).toBe(0);
    expect(graph.nodes.get('A')!.dependencies.size).toBe(0);
    expect(graph.nodes.get('A')!.dependents.size).toBe(0);
  });
});
