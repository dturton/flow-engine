/**
 * Run query and management routes. Provides paginated listing of flow runs
 * (with optional status filtering), individual run lookup, and cancellation.
 */

import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../deps.js';

const VALID_STATUSES = ['queued', 'running', 'completed', 'failed', 'cancelled'] as const;

/** Register all run-related routes on the given Fastify instance. */
export async function runRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  /**
   * GET /api/flows/:flowId/runs — paginated run list for a specific flow.
   * Supports ?limit (max 200), ?offset, and ?status query parameters.
   */
  app.get('/api/flows/:flowId/runs', async (request, reply) => {
    const { flowId } = request.params as { flowId: string };
    const { limit: limitStr, status, offset: offsetStr } = request.query as { limit?: string; status?: string; offset?: string };
    let take = 50;
    if (limitStr) {
      take = parseInt(limitStr, 10);
      if (Number.isNaN(take) || take < 1) {
        return reply.status(400).send({ error: 'Invalid limit parameter' });
      }
      take = Math.min(take, 200);
    }
    let skip = 0;
    if (offsetStr) {
      skip = parseInt(offsetStr, 10);
      if (Number.isNaN(skip) || skip < 0) {
        return reply.status(400).send({ error: 'Invalid offset parameter' });
      }
    }
    const where: Record<string, unknown> = { flowId };
    if (status) {
      if (!VALID_STATUSES.includes(status as typeof VALID_STATUSES[number])) {
        return reply.status(400).send({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` });
      }
      where.status = status;
    }
    const [runs, total] = await Promise.all([
      deps.prisma.flowRun.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        take,
        skip,
        include: { stepRuns: true },
      }),
      deps.prisma.flowRun.count({ where }),
    ]);
    return reply.send({ runs, total, limit: take, offset: skip });
  });

  /** GET /api/runs — recent runs across all flows (max 100). Supports ?status filter. */
  app.get('/api/runs', async (request, reply) => {
    const { limit: limitStr, status } = request.query as { limit?: string; status?: string };
    let take = 20;
    if (limitStr) {
      take = parseInt(limitStr, 10);
      if (Number.isNaN(take) || take < 1) {
        return reply.status(400).send({ error: 'Invalid limit parameter' });
      }
      take = Math.min(take, 100);
    }
    const where: Record<string, unknown> = {};
    if (status) {
      if (!VALID_STATUSES.includes(status as typeof VALID_STATUSES[number])) {
        return reply.status(400).send({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` });
      }
      where.status = status;
    }
    const runs = await deps.prisma.flowRun.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      take,
      include: { stepRuns: true },
    });
    return reply.send(runs);
  });

  /** GET /api/runs/:runId — retrieve a single run with its step runs. */
  app.get('/api/runs/:runId', async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const run = await deps.runRepository.findById(runId);
    if (!run) {
      return reply.status(404).send({ error: 'Run not found' });
    }
    return reply.send(run);
  });

  /** POST /api/runs/:runId/cancel — cancel a running flow. Returns 409 if already terminal. */
  app.post('/api/runs/:runId/cancel', async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const run = await deps.runRepository.findById(runId);
    if (!run) {
      return reply.status(404).send({ error: 'Run not found' });
    }

    if (run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled') {
      return reply.status(409).send({ error: `Run is already ${run.status}` });
    }

    await deps.runRepository.updateStatus(runId, 'cancelled', new Date());
    return reply.send({ message: 'Run cancelled', runId });
  });
}
