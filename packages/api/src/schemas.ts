/**
 * Zod request-validation schemas for the API. Each schema corresponds to
 * a specific request body shape and is used for parsing/validation before
 * the request reaches business logic.
 */

import { z } from 'zod';

/** A single input mapping expression — supports JSONPath, JSONata, literal, or template types. */
const MappingExpressionSchema = z.object({
  type: z.enum(['jsonpath', 'jsonata', 'literal', 'template']),
  value: z.string(),
});

const RetryPolicySchema = z.object({
  maxAttempts: z.number().int().positive(),
  strategy: z.enum(['fixed', 'exponential', 'jitter']),
  initialDelayMs: z.number().int().positive(),
  maxDelayMs: z.number().int().positive(),
  retryableErrors: z.array(z.enum(['network', 'rateLimit', 'timeout', 'serverError'])),
});

const BranchCaseSchema = z.object({
  when: z.string(),
  nextStepId: z.string(),
});

const StepDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(['action', 'transform', 'branch', 'loop', 'delay', 'script']),
  connectorKey: z.string().optional(),
  connectionId: z.string().optional(),
  operationId: z.string().optional(),
  inputMapping: z.record(z.union([MappingExpressionSchema, z.string()])),
  outputMapping: z.record(z.string()).optional(),
  dependsOn: z.array(z.string()),
  retryPolicy: RetryPolicySchema.optional(),
  timeoutMs: z.number().int().positive().optional(),
  continueOnError: z.boolean().optional(),
  branches: z.array(BranchCaseSchema).optional(),
  loopOver: z.string().optional(),
});

const FlowErrorPolicySchema = z.object({
  onStepFailure: z.enum(['halt', 'continue', 'goto']),
  errorStepId: z.string().optional(),
});

/** Schema for POST /api/flows — validates a full flow definition with at least one step. */
export const CreateFlowSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  tenantId: z.string().min(1),
  steps: z.array(StepDefinitionSchema).min(1),
  errorPolicy: FlowErrorPolicySchema,
  tags: z.array(z.string()).optional(),
});

/** Schema for PUT /api/flows/:flowId — all fields optional except tenantId (immutable). */
export const UpdateFlowSchema = CreateFlowSchema.partial().omit({ tenantId: true });

/** Schema for POST /api/flows/:flowId/trigger — specifies trigger type and arbitrary payload. */
export const TriggerFlowSchema = z.object({
  type: z.enum(['webhook', 'schedule', 'manual', 'event']),
  data: z.record(z.unknown()),
});

/** Schema for POST /api/connections — creates a new connector credential set. */
export const CreateConnectionSchema = z.object({
  tenantId: z.string().min(1),
  connectorKey: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  credentials: z.record(z.unknown()),
  config: z.record(z.unknown()).optional(),
});

/** Schema for PUT /api/connections/:connectionId — partial update of connection fields. */
export const UpdateConnectionSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  credentials: z.record(z.unknown()).optional(),
  config: z.record(z.unknown()).optional(),
});

export type CreateConnectionInput = z.infer<typeof CreateConnectionSchema>;
export type UpdateConnectionInput = z.infer<typeof UpdateConnectionSchema>;
export type CreateFlowInput = z.infer<typeof CreateFlowSchema>;
export type UpdateFlowInput = z.infer<typeof UpdateFlowSchema>;
export type TriggerFlowInput = z.infer<typeof TriggerFlowSchema>;
