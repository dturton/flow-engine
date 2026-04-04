import type { FastifyInstance } from 'fastify';
import { CreateConnectionSchema, UpdateConnectionSchema } from '../schemas.js';
import type { AppDeps } from '../deps.js';

export async function connectionRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  // List connections (filter by tenantId, optionally by connectorKey)
  app.get('/api/connections', async (request, reply) => {
    const { tenantId, connectorKey } = request.query as { tenantId?: string; connectorKey?: string };
    if (!tenantId) {
      return reply.status(400).send({ error: 'tenantId query parameter is required' });
    }
    const connections = await deps.connectionRepository.findByTenant(tenantId, connectorKey);
    return reply.send(connections);
  });

  // Get connection by ID
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

  // Create connection
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
      credentials: parsed.data.credentials as Record<string, unknown>,
      config: (parsed.data.config ?? {}) as Record<string, unknown>,
    });
    return reply.status(201).send(connection);
  });

  // Update connection
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

    const updated = await deps.connectionRepository.update(connectionId, parsed.data as Record<string, unknown>);
    return reply.send(updated);
  });

  // Delete connection
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

/** Replace credential values with masked strings for safe API responses. */
function maskCredentials(creds: Record<string, unknown>): Record<string, unknown> {
  const masked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(creds)) {
    if (typeof value === 'string' && value.length > 4) {
      masked[key] = value.slice(0, 4) + '****';
    } else {
      masked[key] = '****';
    }
  }
  return masked;
}
