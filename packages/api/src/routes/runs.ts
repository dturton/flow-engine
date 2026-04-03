import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../deps.js';

export async function runRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  // List runs for a flow
  app.get('/api/flows/:flowId/runs', async (request, reply) => {
    const { flowId } = request.params as { flowId: string };
    const { limit: limitStr } = request.query as { limit?: string };
    let take = 50;
    if (limitStr) {
      take = parseInt(limitStr, 10);
      if (Number.isNaN(take) || take < 1) {
        return reply.status(400).send({ error: 'Invalid limit parameter' });
      }
      take = Math.min(take, 200);
    }
    const runs = await deps.runRepository.findByFlowId(flowId, take);
    return reply.send(runs);
  });

  // Get a specific run
  app.get('/api/runs/:runId', async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const run = await deps.runRepository.findById(runId);
    if (!run) {
      return reply.status(404).send({ error: 'Run not found' });
    }
    return reply.send(run);
  });

  // Cancel a run
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
