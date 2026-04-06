/**
 * @module @flow-engine/core
 *
 * Public API surface for the flow engine core package. Re-exports the engine,
 * DAG resolver, context store, executors, repositories, types, errors, and
 * utility functions so consumers only need a single import source.
 */

export { FlowEngine } from './engine/FlowEngine.js';
export type { FlowEngineOptions } from './engine/FlowEngine.js';
export { DagResolver } from './engine/DagResolver.js';
export type { ExecutionNode, ExecutionGraph, ValidationIssue } from './engine/DagResolver.js';
export { ContextStore } from './engine/ContextStore.js';
export { StepExecutorRegistry, InputResolver } from './engine/StepExecutor.js';
export type { StepExecutor, StepExecutionInput, StepExecutionResult } from './engine/StepExecutor.js';
export { RetryManager } from './engine/RetryManager.js';
export { FlowRunRepository } from './persistence/FlowRunRepository.js';
export { FlowDefinitionRepository } from './persistence/FlowDefinitionRepository.js';
export { ConnectionRepository } from './persistence/ConnectionRepository.js';
export type { Connection } from './persistence/ConnectionRepository.js';
export { WebhookRepository } from './persistence/WebhookRepository.js';
export type { Webhook } from './persistence/WebhookRepository.js';
export { ActionExecutor, ConnectorRegistry } from './executors/ActionExecutor.js';
export type { Connector, ConnectionResolver } from './executors/ActionExecutor.js';
export { TransformExecutor } from './executors/TransformExecutor.js';
export { BranchExecutor } from './executors/BranchExecutor.js';
export { ScriptExecutor } from './executors/ScriptExecutor.js';
export { LoopExecutor } from './executors/LoopExecutor.js';
export { DelayExecutor } from './executors/DelayExecutor.js';
export * from './types/flow.js';
export * from './types/run.js';
export * from './errors.js';
export { signPayload, verifySignature } from './webhook-signature.js';
export { PrismaClient } from './generated/prisma/client.js';
export type { Prisma } from './generated/prisma/client.js';
export { createPrismaClient } from './persistence/createPrismaClient.js';
