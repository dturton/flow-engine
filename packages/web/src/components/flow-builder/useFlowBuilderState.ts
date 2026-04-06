import { useReducer } from 'react';

export type StepType = 'action' | 'transform' | 'branch' | 'loop' | 'delay' | 'script';

export interface MappingExpression {
  type: 'jsonpath' | 'jsonata' | 'literal' | 'template';
  value: string;
}

export interface RetryPolicy {
  maxAttempts: number;
  strategy: 'fixed' | 'exponential' | 'jitter';
  initialDelayMs: number;
  maxDelayMs: number;
  retryableErrors: Array<'network' | 'rateLimit' | 'timeout' | 'serverError'>;
}

export interface BranchCase {
  when: string;
  nextStepId: string;
}

export interface StepDefinition {
  id: string;
  name: string;
  type: StepType;
  connectorKey?: string;
  connectionId?: string;
  operationId?: string;
  inputMapping: Record<string, MappingExpression | string>;
  outputMapping?: Record<string, string>;
  dependsOn: string[];
  retryPolicy?: RetryPolicy;
  timeoutMs?: number;
  continueOnError?: boolean;
  branches?: BranchCase[];
  loopOver?: string;
}

export interface FlowErrorPolicy {
  onStepFailure: 'halt' | 'continue' | 'goto';
  errorStepId?: string;
}

export interface FlowFunction {
  name: string;
  params: string[];
  body: string;
}

export interface FlowBuilderState {
  name: string;
  description: string;
  tenantId: string;
  tags: string[];
  errorPolicy: FlowErrorPolicy;
  steps: StepDefinition[];
  functions: FlowFunction[];
  selectedStepId: string | null;
  activeTab: 'canvas' | 'functions' | 'json';
}

export type FlowBuilderAction =
  | { type: 'SET_METADATA'; payload: Partial<Pick<FlowBuilderState, 'name' | 'description' | 'tenantId' | 'tags' | 'errorPolicy'>> }
  | { type: 'ADD_STEP'; payload: { stepType: StepType } }
  | { type: 'UPDATE_STEP'; payload: { stepId: string; changes: Partial<StepDefinition> } }
  | { type: 'DELETE_STEP'; payload: { stepId: string } }
  | { type: 'ADD_EDGE'; payload: { sourceStepId: string; targetStepId: string } }
  | { type: 'DELETE_EDGE'; payload: { sourceStepId: string; targetStepId: string } }
  | { type: 'SELECT_STEP'; payload: { stepId: string | null } }
  | { type: 'SET_FUNCTIONS'; payload: FlowFunction[] }
  | { type: 'SET_TAB'; payload: FlowBuilderState['activeTab'] }
  | { type: 'LOAD_FLOW'; payload: Omit<FlowBuilderState, 'selectedStepId' | 'activeTab'> };

let counter = 0;

export function generateStepId(stepType: StepType): string {
  counter += 1;
  return `${stepType}_${counter}_${Math.random().toString(36).slice(2, 7)}`;
}

function createDefaultStep(stepType: StepType): StepDefinition {
  const id = generateStepId(stepType);
  const base: StepDefinition = {
    id,
    name: stepType.charAt(0).toUpperCase() + stepType.slice(1) + ' Step',
    type: stepType,
    dependsOn: [],
    inputMapping: {},
  };

  switch (stepType) {
    case 'action':
      base.connectorKey = 'http';
      base.operationId = 'request';
      base.inputMapping = {
        url: { type: 'literal', value: 'https://example.com' },
        method: { type: 'literal', value: 'GET' },
      };
      break;
    case 'script':
      base.inputMapping = {
        script: { type: 'literal', value: '// Your code here\noutput = { result: inputs };' },
      };
      break;
    case 'branch':
      base.branches = [{ when: 'true', nextStepId: '' }];
      break;
    case 'delay':
      base.inputMapping = {
        delayMs: { type: 'literal', value: '1000' },
      };
      break;
    case 'loop':
      base.loopOver = '$.steps.previous.data.items';
      break;
    default:
      break;
  }

  return base;
}

function reducer(state: FlowBuilderState, action: FlowBuilderAction): FlowBuilderState {
  switch (action.type) {
    case 'SET_METADATA':
      return { ...state, ...action.payload };

    case 'ADD_STEP': {
      const step = createDefaultStep(action.payload.stepType);
      return {
        ...state,
        steps: [...state.steps, step],
        selectedStepId: step.id,
      };
    }

    case 'UPDATE_STEP':
      return {
        ...state,
        steps: state.steps.map((s) =>
          s.id === action.payload.stepId ? { ...s, ...action.payload.changes } : s,
        ),
      };

    case 'DELETE_STEP': {
      const deletedId = action.payload.stepId;
      return {
        ...state,
        steps: state.steps
          .filter((s) => s.id !== deletedId)
          .map((s) => ({
            ...s,
            dependsOn: s.dependsOn.filter((d) => d !== deletedId),
            branches: s.branches?.map((b) =>
              b.nextStepId === deletedId ? { ...b, nextStepId: '' } : b,
            ),
          })),
        selectedStepId: state.selectedStepId === deletedId ? null : state.selectedStepId,
      };
    }

    case 'ADD_EDGE': {
      const { sourceStepId, targetStepId } = action.payload;
      return {
        ...state,
        steps: state.steps.map((s) =>
          s.id === targetStepId && !s.dependsOn.includes(sourceStepId)
            ? { ...s, dependsOn: [...s.dependsOn, sourceStepId] }
            : s,
        ),
      };
    }

    case 'DELETE_EDGE': {
      const { sourceStepId, targetStepId } = action.payload;
      return {
        ...state,
        steps: state.steps.map((s) =>
          s.id === targetStepId
            ? { ...s, dependsOn: s.dependsOn.filter((d) => d !== sourceStepId) }
            : s,
        ),
      };
    }

    case 'SELECT_STEP':
      return { ...state, selectedStepId: action.payload.stepId };

    case 'SET_FUNCTIONS':
      return { ...state, functions: action.payload };

    case 'SET_TAB':
      return { ...state, activeTab: action.payload };

    case 'LOAD_FLOW':
      return { ...action.payload, selectedStepId: null, activeTab: 'canvas' };

    default:
      return state;
  }
}

export const INITIAL_STATE: FlowBuilderState = {
  name: '',
  description: '',
  tenantId: 'demo-tenant',
  tags: [],
  errorPolicy: { onStepFailure: 'halt' },
  steps: [],
  functions: [],
  selectedStepId: null,
  activeTab: 'canvas',
};

export function useFlowBuilderState(initial?: Partial<FlowBuilderState>) {
  return useReducer(reducer, { ...INITIAL_STATE, ...initial });
}
