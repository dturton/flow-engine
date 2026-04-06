/**
 * Fastify application factory. Creates and configures the Fastify instance
 * with CORS, a centralised error handler, and all route plugins.
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import type { AppConfig } from './config.js';
import type { AppDeps } from './deps.js';
import { flowRoutes } from './routes/flows.js';
import { runRoutes } from './routes/runs.js';
import { connectionRoutes } from './routes/connections.js';
import { healthRoutes } from './routes/health.js';
import { webhookRoutes } from './routes/webhooks.js';

/**
 * Build and return a fully configured Fastify instance with all route
 * plugins registered. The caller is responsible for calling `app.listen()`.
 */
export async function buildApp(config: AppConfig, deps: AppDeps) {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
    },
  });

  await app.register(cors, { origin: config.corsOrigin });

  // Error handler
  app.setErrorHandler((error: Error & { statusCode?: number; code?: string }, _request, reply) => {
    app.log.error(error);
    const statusCode = error.statusCode ?? 500;
    reply.status(statusCode).send({
      error: error.message,
      code: error.code ?? 'INTERNAL_ERROR',
    });
  });

  // Register routes
  await flowRoutes(app, deps);
  await runRoutes(app, deps);
  await connectionRoutes(app, deps);
  await healthRoutes(app, deps);
  await webhookRoutes(app, deps);

  return app;
}
