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

  /** POST /api/connections/:connectionId/test — verify a connection's credentials work. */
  app.post('/api/connections/:connectionId/test', async (request, reply) => {
    const { connectionId } = request.params as { connectionId: string };
    const connection = await deps.connectionRepository.findById(connectionId);
    if (!connection) {
      return reply.status(404).send({ error: 'Connection not found' });
    }

    try {
      const result = await testConnection(connection.connectorKey, connection.credentials, connection.config);
      return reply.send({ success: true, ...result });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection test failed';
      return reply.send({ success: false, error: message });
    }
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

/** Test a connection by making a lightweight API call based on connector type. */
async function testConnection(
  connectorKey: string,
  credentials: Record<string, unknown>,
  config: Record<string, unknown>,
): Promise<{ message: string; details?: Record<string, unknown> }> {
  switch (connectorKey) {
    case 'shopify': {
      const storeUrl = credentials.storeUrl as string;
      if (!storeUrl) throw new Error('Missing storeUrl in credentials');
      const store = storeUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
      const apiVersion = (config.apiVersion as string) ?? '2025-01';

      // Resolve access token — use static token or exchange via OAuth
      let accessToken = credentials.accessToken as string | undefined;
      if (!accessToken) {
        const clientId = credentials.clientId as string;
        const clientSecret = credentials.clientSecret as string;
        if (!clientId || !clientSecret) {
          throw new Error('Either accessToken or clientId + clientSecret required');
        }
        const tokenRes = await fetch(`https://${store}/admin/oauth/access_token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: clientId,
            client_secret: clientSecret,
          }).toString(),
        });
        if (!tokenRes.ok) {
          const text = await tokenRes.text();
          throw new Error(`Token exchange failed (${tokenRes.status}): ${text}`);
        }
        const tokenData = await tokenRes.json() as { access_token: string };
        accessToken = tokenData.access_token;
      }

      // Call shop.json — lightweight endpoint that returns store info
      const res = await fetch(`https://${store}/admin/api/${apiVersion}/shop.json`, {
        headers: { 'X-Shopify-Access-Token': accessToken },
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Shopify API returned ${res.status}: ${text}`);
      }
      const data = await res.json() as { shop: { name: string; domain: string } };
      return {
        message: `Connected to "${data.shop.name}" (${data.shop.domain})`,
        details: { shopName: data.shop.name, domain: data.shop.domain },
      };
    }

    case 'http': {
      const baseUrl = credentials.baseUrl as string;
      if (!baseUrl) {
        return { message: 'HTTP connector configured (no base URL to test)' };
      }
      const res = await fetch(baseUrl, {
        method: 'HEAD',
        signal: AbortSignal.timeout(10_000),
      });
      return { message: `Reachable (HTTP ${res.status})` };
    }

    default:
      throw new Error(`No test implemented for connector "${connectorKey}"`);
  }
}
