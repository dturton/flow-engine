import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { verifySignature } from '@flow-engine/core';
import type { AppDeps } from '../deps.js';

function generatePath(): string {
  return randomBytes(16).toString('hex');
}

function generateSecret(): string {
  return randomBytes(32).toString('hex');
}

export async function webhookRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  // Create a webhook for a flow
  app.post('/api/flows/:flowId/webhooks', async (request, reply) => {
    const { flowId } = request.params as { flowId: string };
    const flow = await deps.flowRepository.findById(flowId);
    if (!flow) {
      return reply.status(404).send({ error: 'Flow not found' });
    }

    const path = generatePath();
    const secret = generateSecret();

    const webhook = await deps.webhookRepository.create({ flowId, path, secret });

    return reply.status(201).send(webhook);
  });

  // List webhooks for a flow
  app.get('/api/flows/:flowId/webhooks', async (request, reply) => {
    const { flowId } = request.params as { flowId: string };
    const webhooks = await deps.webhookRepository.findByFlowId(flowId);
    return reply.send(webhooks);
  });

  // Delete a webhook
  app.delete('/api/webhooks/:webhookId', async (request, reply) => {
    const { webhookId } = request.params as { webhookId: string };
    try {
      await deps.webhookRepository.delete(webhookId);
    } catch {
      return reply.status(404).send({ error: 'Webhook not found' });
    }
    return reply.status(204).send();
  });

  // ── Public webhook trigger endpoint ──────────────────────────────────────
  // This sits outside /api so it can be called by external services.
  // Accepts any JSON body. Optionally verifies X-Webhook-Signature header.
  app.post('/webhooks/:path', {
    config: { rawBody: true },
  }, async (request, reply) => {
    const { path } = request.params as { path: string };

    const webhook = await deps.webhookRepository.findByPath(path);
    if (!webhook || !webhook.active) {
      return reply.status(404).send({ error: 'Webhook not found' });
    }

    // Verify HMAC signature if provided
    const signature = request.headers['x-webhook-signature'] as string | undefined;
    if (signature) {
      const rawBody = typeof request.body === 'string'
        ? request.body
        : JSON.stringify(request.body);
      if (!verifySignature(rawBody, webhook.secret, signature)) {
        return reply.status(401).send({ error: 'Invalid signature' });
      }
    }

    const flow = await deps.flowRepository.findById(webhook.flowId);
    if (!flow) {
      return reply.status(404).send({ error: 'Flow not found' });
    }

    const trigger = {
      type: 'webhook' as const,
      data: {
        body: request.body ?? {},
        headers: request.headers,
        query: request.query,
        webhookId: webhook.id,
        webhookPath: webhook.path,
      },
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
