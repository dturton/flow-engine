import { z } from 'zod';

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

export const CreateFlowSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  tenantId: z.string().min(1),
  steps: z.array(StepDefinitionSchema).min(1),
  errorPolicy: FlowErrorPolicySchema,
  tags: z.array(z.string()).optional(),
});

export const UpdateFlowSchema = CreateFlowSchema.partial().omit({ tenantId: true });

export const TriggerFlowSchema = z.object({
  type: z.enum(['webhook', 'schedule', 'manual', 'event']),
  data: z.record(z.unknown()),
});

export type CreateFlowInput = z.infer<typeof CreateFlowSchema>;
export type UpdateFlowInput = z.infer<typeof UpdateFlowSchema>;
export type TriggerFlowInput = z.infer<typeof TriggerFlowSchema>;
