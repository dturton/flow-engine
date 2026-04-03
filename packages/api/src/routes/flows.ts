import type { FastifyInstance } from 'fastify';
import type { FlowDefinition, ValidationIssue } from '@flow-engine/core';
import { DagResolver } from '@flow-engine/core';
import { CreateFlowSchema, UpdateFlowSchema, TriggerFlowSchema } from '../schemas.js';
import type { AppDeps } from '../deps.js';

// In-memory store for flow definitions (would be a DB table in production)
const flowStore = new Map<string, FlowDefinition>();
let flowCounter = 0;

export async function flowRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  const dagResolver = new DagResolver();

  // List flows (optionally filter by tenantId)
  app.get('/api/flows', async (request, reply) => {
    const { tenantId, tag } = request.query as { tenantId?: string; tag?: string };
    let flows = Array.from(flowStore.values());

    if (tenantId) {
      flows = flows.filter((f) => f.tenantId === tenantId);
    }
    if (tag) {
      flows = flows.filter((f) => f.tags?.includes(tag));
    }

    return reply.send(flows);
  });

  // Get flow by ID
  app.get('/api/flows/:flowId', async (request, reply) => {
    const { flowId } = request.params as { flowId: string };
    const flow = flowStore.get(flowId);
    if (!flow) {
      return reply.status(404).send({ error: 'Flow not found' });
    }
    return reply.send(flow);
  });

  // Create flow
  app.post('/api/flows', async (request, reply) => {
    const parsed = CreateFlowSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', details: parsed.error.issues });
    }

    const input = parsed.data;
    const id = `flow_${++flowCounter}`;
    const now = new Date();

    const flow: FlowDefinition = {
      id,
      version: 1,
      name: input.name,
      description: input.description,
      tenantId: input.tenantId,
      steps: input.steps,
      errorPolicy: input.errorPolicy,
      tags: input.tags,
      createdAt: now,
      updatedAt: now,
    };

    // Validate the DAG
    const issues = dagResolver.validate(flow);
    const errors = issues.filter((i: ValidationIssue) => i.severity === 'error');
    if (errors.length > 0) {
      return reply.status(400).send({ error: 'Flow validation failed', details: errors });
    }

    flowStore.set(id, flow);
    return reply.status(201).send(flow);
  });

  // Update flow
  app.put('/api/flows/:flowId', async (request, reply) => {
    const { flowId } = request.params as { flowId: string };
    const existing = flowStore.get(flowId);
    if (!existing) {
      return reply.status(404).send({ error: 'Flow not found' });
    }

    const parsed = UpdateFlowSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', details: parsed.error.issues });
    }

    const updated: FlowDefinition = {
      ...existing,
      ...parsed.data,
      version: existing.version + 1,
      updatedAt: new Date(),
    };

    // Validate updated DAG
    const issues = dagResolver.validate(updated);
    const errors = issues.filter((i: ValidationIssue) => i.severity === 'error');
    if (errors.length > 0) {
      return reply.status(400).send({ error: 'Flow validation failed', details: errors });
    }

    flowStore.set(flowId, updated);
    return reply.send(updated);
  });

  // Delete flow
  app.delete('/api/flows/:flowId', async (request, reply) => {
    const { flowId } = request.params as { flowId: string };
    if (!flowStore.has(flowId)) {
      return reply.status(404).send({ error: 'Flow not found' });
    }
    flowStore.delete(flowId);
    return reply.status(204).send();
  });

  // Trigger flow execution (enqueues a job for the worker)
  app.post('/api/flows/:flowId/trigger', async (request, reply) => {
    const { flowId } = request.params as { flowId: string };
    const flow = flowStore.get(flowId);
    if (!flow) {
      return reply.status(404).send({ error: 'Flow not found' });
    }

    const parsed = TriggerFlowSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', details: parsed.error.issues });
    }

    const trigger = {
      ...parsed.data,
      receivedAt: new Date(),
    };

    const job = await deps.flowQueue.add('execute-flow', {
      flow,
      trigger,
    }, {
      jobId: crypto.randomUUID(),
      attempts: 1,
    });

    return reply.status(202).send({
      message: 'Flow execution queued',
      jobId: job.id,
      flowId: flow.id,
    });
  });
}

// Expose for testing / worker access
export function getFlowStore(): Map<string, FlowDefinition> {
  return flowStore;
}
