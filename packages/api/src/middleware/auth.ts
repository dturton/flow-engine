/**
 * API key authentication middleware. Validates Bearer tokens in the
 * Authorization header against the API_KEY environment variable.
 * If API_KEY is not set, requests are allowed through (dev mode).
 */

import type { FastifyInstance } from 'fastify';

/** Register an onRequest hook that enforces API key authentication. */
export function registerAuth(app: FastifyInstance): void {
  const apiKey = process.env.API_KEY;

  if (!apiKey) {
    app.log.warn('API_KEY is not set — authentication is disabled (dev mode)');
    return;
  }

  app.addHook('onRequest', async (request, reply) => {
    // Skip auth for health check
    if (request.url === '/health') return;

    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Missing or invalid Authorization header' });
    }

    const token = authHeader.slice(7);
    if (token !== apiKey) {
      return reply.status(401).send({ error: 'Invalid API key' });
    }
  });
}
