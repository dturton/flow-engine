import type { FastifyInstance } from 'fastify';
import type { FlowDefinition, ValidationIssue } from '@flow-engine/core';
import { DagResolver } from '@flow-engine/core';
import { CreateFlowSchema, UpdateFlowSchema, TriggerFlowSchema } from '../schemas.js';
import type { AppDeps } from '../deps.js';

export async function flowRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  const dagResolver = new DagResolver();

  // List flows (optionally filter by tenantId or tag)
  app.get('/api/flows', async (request, reply) => {
    const { tenantId, tag } = request.query as { tenantId?: string; tag?: string };
    const flows = await deps.flowRepository.findAll({ tenantId, tag });
    return reply.send(flows);
  });

  // Get flow by ID
  app.get('/api/flows/:flowId', async (request, reply) => {
    const { flowId } = request.params as { flowId: string };
    const flow = await deps.flowRepository.findById(flowId);
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

    // Build a temporary FlowDefinition for DAG validation
    const tempFlow: FlowDefinition = {
      id: 'temp',
      version: 1,
      name: input.name,
      description: input.description,
      tenantId: input.tenantId,
      steps: input.steps,
      errorPolicy: input.errorPolicy,
      tags: input.tags,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const issues = dagResolver.validate(tempFlow);
    const errors = issues.filter((i: ValidationIssue) => i.severity === 'error');
    if (errors.length > 0) {
      return reply.status(400).send({ error: 'Flow validation failed', details: errors });
    }

    const flow = await deps.flowRepository.create(input);
    return reply.status(201).send(flow);
  });

  // Update flow
  app.put('/api/flows/:flowId', async (request, reply) => {
    const { flowId } = request.params as { flowId: string };
    const existing = await deps.flowRepository.findById(flowId);
    if (!existing) {
      return reply.status(404).send({ error: 'Flow not found' });
    }

    const parsed = UpdateFlowSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', details: parsed.error.issues });
    }

    // Validate updated DAG if steps changed
    if (parsed.data.steps) {
      const tempFlow: FlowDefinition = {
        ...existing,
        ...parsed.data,
        version: existing.version + 1,
        updatedAt: new Date(),
      };
      const issues = dagResolver.validate(tempFlow);
      const errors = issues.filter((i: ValidationIssue) => i.severity === 'error');
      if (errors.length > 0) {
        return reply.status(400).send({ error: 'Flow validation failed', details: errors });
      }
    }

    const updated = await deps.flowRepository.update(flowId, parsed.data);
    return reply.send(updated);
  });

  // Delete flow
  app.delete('/api/flows/:flowId', async (request, reply) => {
    const { flowId } = request.params as { flowId: string };
    const existing = await deps.flowRepository.findById(flowId);
    if (!existing) {
      return reply.status(404).send({ error: 'Flow not found' });
    }
    await deps.flowRepository.delete(flowId);
    return reply.status(204).send();
  });

  // Trigger flow execution (enqueues a job for the worker)
  app.post('/api/flows/:flowId/trigger', async (request, reply) => {
    const { flowId } = request.params as { flowId: string };
    const flow = await deps.flowRepository.findById(flowId);
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
