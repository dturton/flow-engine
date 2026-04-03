import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../deps.js';

export async function healthRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  app.get('/health', async (_request, reply) => {
    try {
      const redisOk = deps.redis.status === 'ready';
      await deps.prisma.$queryRaw`SELECT 1`;
      const statusCode = redisOk ? 200 : 503;
      return reply.status(statusCode).send({
        status: redisOk ? 'ok' : 'degraded',
        redis: redisOk ? 'connected' : 'disconnected',
        database: 'connected',
      });
    } catch (err) {
      return reply.status(503).send({
        status: 'degraded',
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  });
}
