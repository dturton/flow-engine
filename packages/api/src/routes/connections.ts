/**
 * Connection CRUD routes. Connections hold per-tenant credentials for a
 * given connector (e.g. Shopify, HTTP). Credential values are masked in
 * all API responses to prevent accidental leakage.
 */

import type { FastifyInstance } from 'fastify';
import { CreateConnectionSchema, UpdateConnectionSchema } from '../schemas.js';
import type { AppDeps } from '../deps.js';

/** Register all /api/connections routes on the given Fastify instance. */
export async function connectionRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  /** GET /api/connections — list connections for a tenant. Requires ?tenantId. */
  app.get('/api/connections', async (request, reply) => {
    const { tenantId, connectorKey } = request.query as { tenantId?: string; connectorKey?: string };
    if (!tenantId) {
      return reply.status(400).send({ error: 'tenantId query parameter is required' });
    }
    const connections = await deps.connectionRepository.findByTenant(tenantId, connectorKey);
    return reply.send(connections.map((c) => ({ ...c, credentials: maskCredentials(c.credentials) })));
  });

  /** GET /api/connections/:connectionId — retrieve a single connection (credentials masked). */
  app.get('/api/connections/:connectionId', async (request, reply) => {
    const { connectionId } = request.params as { connectionId: string };
    const connection = await deps.connectionRepository.findById(connectionId);
    if (!connection) {
      return reply.status(404).send({ error: 'Connection not found' });
    }
    // Mask credentials in response
    return reply.send({
      ...connection,
      credentials: maskCredentials(connection.credentials),
    });
  });

  /** POST /api/connections — create a new connection with Zod-validated body. */
  app.post('/api/connections', async (request, reply) => {
    const parsed = CreateConnectionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', details: parsed.error.issues });
    }

    const connection = await deps.connectionRepository.create({
      tenantId: parsed.data.tenantId,
      connectorKey: parsed.data.connectorKey,
      name: parsed.data.name,
      description: parsed.data.description,
      credentials: parsed.data.credentials,
      config: parsed.data.config ?? {},
    });
    return reply.status(201).send({ ...connection, credentials: maskCredentials(connection.credentials) });
  });

  /** PUT /api/connections/:connectionId — partial update of connection fields. */
  app.put('/api/connections/:connectionId', async (request, reply) => {
    const { connectionId } = request.params as { connectionId: string };
    const existing = await deps.connectionRepository.findById(connectionId);
    if (!existing) {
      return reply.status(404).send({ error: 'Connection not found' });
    }

    const parsed = UpdateConnectionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', details: parsed.error.issues });
    }

    const updated = await deps.connectionRepository.update(connectionId, parsed.data);
    return reply.send({ ...updated, credentials: maskCredentials(updated.credentials) });
  });

  /** DELETE /api/connections/:connectionId — remove a connection. */
  app.delete('/api/connections/:connectionId', async (request, reply) => {
    const { connectionId } = request.params as { connectionId: string };
    const existing = await deps.connectionRepository.findById(connectionId);
    if (!existing) {
      return reply.status(404).send({ error: 'Connection not found' });
    }
    await deps.connectionRepository.delete(connectionId);
    return reply.status(204).send();
  });
}

/** Replace all credential values with a fixed mask for safe API responses. */
function maskCredentials(creds: Record<string, unknown>): Record<string, unknown> {
  const masked: Record<string, unknown> = {};
  for (const key of Object.keys(creds)) {
    masked[key] = '****';
  }
  return masked;
}
