import type { StepType } from './useFlowBuilderState.js';

export interface StepTypeInfo {
  type: StepType;
  label: string;
  description: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

export const STEP_TYPES: StepTypeInfo[] = [
  {
    type: 'action',
    label: 'Action',
    description: 'Invoke a connector',
    color: 'text-purple-700',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-300',
  },
  {
    type: 'transform',
    label: 'Transform',
    description: 'Reshape data',
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-300',
  },
  {
    type: 'script',
    label: 'Script',
    description: 'Run JavaScript',
    color: 'text-amber-700',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-300',
  },
  {
    type: 'branch',
    label: 'Branch',
    description: 'Conditional routing',
    color: 'text-orange-700',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-300',
  },
  {
    type: 'loop',
    label: 'Loop',
    description: 'Iterate over array',
    color: 'text-teal-700',
    bgColor: 'bg-teal-50',
    borderColor: 'border-teal-300',
  },
  {
    type: 'delay',
    label: 'Delay',
    description: 'Pause execution',
    color: 'text-gray-700',
    bgColor: 'bg-gray-50',
    borderColor: 'border-gray-300',
  },
];

export const STEP_TYPE_MAP: Record<StepType, StepTypeInfo> = Object.fromEntries(
  STEP_TYPES.map((s) => [s.type, s]),
) as Record<StepType, StepTypeInfo>;
