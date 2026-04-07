import { useState, useEffect } from 'react';
import CodeEditor from '../CodeEditor.js';
import { api, type ConnectionSummary } from '../../api.js';
import InputMappingEditor from './InputMappingEditor.js';
import { PathAutocompleteInput } from './PathAutocomplete.js';
import { STEP_TYPE_MAP } from './stepTypeConfig.js';
import { CONNECTORS, CONNECTOR_MAP } from './connectorConfig.js';
import type {
  FlowBuilderAction,
  StepDefinition,
  BranchCase,
  RetryPolicy,
  MappingExpression,
} from './useFlowBuilderState.js';

interface StepConfigPanelProps {
  step: StepDefinition;
  allSteps: StepDefinition[];
  tenantId: string;
  dispatch: React.Dispatch<FlowBuilderAction>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{title}</h4>
      {children}
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-0.5">{label}</label>
      {children}
    </div>
  );
}

const inputClass = 'w-full text-xs border border-gray-300 rounded px-2 py-1.5 focus:ring-1 focus:ring-blue-500 focus:border-blue-500';
const selectClass = 'w-full text-xs border border-gray-300 rounded px-2 py-1.5 bg-white focus:ring-1 focus:ring-blue-500';

export default function StepConfigPanel({ step, allSteps, tenantId, dispatch }: StepConfigPanelProps) {
  const typeInfo = STEP_TYPE_MAP[step.type];

  const update = (changes: Partial<StepDefinition>) => {
    dispatch({ type: 'UPDATE_STEP', payload: { stepId: step.id, changes } });
  };

  const deleteStep = () => {
    dispatch({ type: 'DELETE_STEP', payload: { stepId: step.id } });
  };

  // Script body helper
  const scriptExpr = step.type === 'script' ? step.inputMapping['script'] : undefined;
  const scriptBody = scriptExpr
    ? typeof scriptExpr === 'string'
      ? scriptExpr
      : scriptExpr.value
    : '';

  const setScript = (body: string) => {
    update({
      inputMapping: {
        ...step.inputMapping,
        script: { type: 'literal' as const, value: body },
      },
    });
  };

  return (
    <div className="w-full md:w-[400px] flex-shrink-0 border-l border-gray-200 bg-white overflow-y-auto">
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${typeInfo.bgColor} ${typeInfo.color}`}>
              {typeInfo.label}
            </span>
            <span className="text-xs text-gray-400 font-mono">{step.id}</span>
          </div>
          <button
            onClick={deleteStep}
            className="text-xs text-red-500 hover:text-red-700 font-medium"
          >
            Delete
          </button>
        </div>

        {/* Common fields */}
        <Section title="General">
          <FieldRow label="Name">
            <input
              type="text"
              value={step.name}
              onChange={(e) => update({ name: e.target.value })}
              className={`${inputClass} ${!step.name.trim() ? 'border-red-400' : ''}`}
              aria-invalid={!step.name.trim() ? 'true' : undefined}
            />
            {!step.name.trim() && (
              <p className="text-[10px] text-red-500 mt-0.5" role="alert">Name is required</p>
            )}
          </FieldRow>
          <FieldRow label="ID">
            <input type="text" value={step.id} readOnly className={`${inputClass} bg-gray-50 text-gray-500`} />
          </FieldRow>
        </Section>

        {/* Action-specific */}
        {step.type === 'action' && (
          <Section title="Connector">
            <FieldRow label="Connector">
              <select
                value={step.connectorKey ?? ''}
                onChange={(e) => {
                  const key = e.target.value;
                  const connector = CONNECTOR_MAP[key];
                  const firstOp = connector?.operations[0]?.id ?? '';
                  update({ connectorKey: key, operationId: firstOp });
                }}
                className={selectClass}
              >
                <option value="">Select connector...</option>
                {CONNECTORS.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label} — {c.description}
                  </option>
                ))}
              </select>
            </FieldRow>
            {step.connectorKey && CONNECTOR_MAP[step.connectorKey] && (
              <>
                <FieldRow label="Operation">
                  <select
                    value={step.operationId ?? ''}
                    onChange={(e) => update({ operationId: e.target.value })}
                    className={selectClass}
                  >
                    <option value="">Select operation...</option>
                    {CONNECTOR_MAP[step.connectorKey].operations.map((op) => (
                      <option key={op.id} value={op.id}>
                        {op.label}
                      </option>
                    ))}
                  </select>
                </FieldRow>
                {CONNECTOR_MAP[step.connectorKey].requiresConnection && (
                  <ConnectionPicker
                    connectorKey={step.connectorKey}
                    tenantId={tenantId}
                    value={step.connectionId ?? ''}
                    onChange={(connectionId) => update({ connectionId })}
                  />
                )}
              </>
            )}
            <RetryPolicyEditor
              policy={step.retryPolicy}
              onChange={(retryPolicy) => update({ retryPolicy })}
            />
          </Section>
        )}

        {/* Script-specific */}
        {step.type === 'script' && (
          <Section title="Script">
            <CodeEditor
              value={scriptBody}
              onChange={setScript}
              placeholder="// Your code here..."
              height="160px"
            />
          </Section>
        )}

        {/* Branch-specific */}
        {step.type === 'branch' && (
          <Section title="Branches">
            <BranchEditor
              branches={step.branches ?? []}
              allSteps={allSteps}
              currentStep={step}
              onChange={(branches) => update({ branches })}
            />
          </Section>
        )}

        {/* Loop-specific */}
        {step.type === 'loop' && (
          <Section title="Loop">
            <FieldRow label="Loop Over (JSONPath)">
              <PathAutocompleteInput
                value={step.loopOver ?? ''}
                onChange={(v) => update({ loopOver: v })}
                exprType="jsonpath"
                currentStep={step}
                allSteps={allSteps}
                className={`${inputClass} font-mono`}
                placeholder="Type $. to see available paths"
              />
            </FieldRow>
          </Section>
        )}

        {/* Delay-specific */}
        {step.type === 'delay' && (
          <Section title="Delay">
            <FieldRow label="Delay (ms)">
              <input
                type="number"
                value={
                  (() => {
                    const val = step.inputMapping['delayMs'];
                    return val ? (typeof val === 'string' ? val : val.value) : '1000';
                  })()
                }
                onChange={(e) =>
                  update({
                    inputMapping: {
                      ...step.inputMapping,
                      delayMs: { type: 'literal', value: e.target.value },
                    },
                  })
                }
                className={inputClass}
                min={0}
              />
            </FieldRow>
          </Section>
        )}

        {/* Input mapping for all types */}
        <InputMappingEditor
          mapping={step.inputMapping}
          onChange={(inputMapping) => update({ inputMapping })}
          excludeKeys={step.type === 'script' ? ['script'] : step.type === 'delay' ? ['delayMs'] : []}
          currentStep={step}
          allSteps={allSteps}
        />

        {/* Advanced options */}
        <Section title="Advanced">
          <FieldRow label="Timeout (ms)">
            <input
              type="number"
              value={step.timeoutMs ?? ''}
              onChange={(e) =>
                update({ timeoutMs: e.target.value ? Number(e.target.value) : undefined })
              }
              className={inputClass}
              placeholder="Optional"
              min={0}
            />
          </FieldRow>
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={step.continueOnError ?? false}
              onChange={(e) => update({ continueOnError: e.target.checked })}
              className="rounded border-gray-300"
            />
            Continue on error
          </label>
        </Section>
      </div>
    </div>
  );
}

function BranchEditor({
  branches,
  allSteps,
  currentStep,
  onChange,
}: {
  branches: BranchCase[];
  allSteps: StepDefinition[];
  currentStep: StepDefinition;
  onChange: (branches: BranchCase[]) => void;
}) {
  const currentStepId = currentStep.id;
  const updateBranch = (idx: number, changes: Partial<BranchCase>) => {
    onChange(branches.map((b, i) => (i === idx ? { ...b, ...changes } : b)));
  };

  const removeBranch = (idx: number) => {
    onChange(branches.filter((_, i) => i !== idx));
  };

  const addBranch = () => {
    onChange([...branches, { when: 'true', nextStepId: '' }]);
  };

  const otherSteps = allSteps.filter((s) => s.id !== currentStepId);

  return (
    <div className="space-y-2">
      {branches.map((branch, idx) => (
        <div key={idx} className="bg-gray-50 rounded-lg p-2 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-400">Branch {idx + 1}</span>
            <button
              onClick={() => removeBranch(idx)}
              className="text-xs text-gray-400 hover:text-red-500"
            >
              &times;
            </button>
          </div>
          <PathAutocompleteInput
            value={branch.when}
            onChange={(v) => updateBranch(idx, { when: v })}
            exprType="jsonata"
            currentStep={currentStep}
            allSteps={allSteps}
            multiline
            rows={1}
            className="w-full text-xs font-mono border border-gray-300 rounded px-2 py-1 focus:ring-1 focus:ring-blue-500 resize-y"
            placeholder="Type to see available paths"
          />
          <select
            value={branch.nextStepId}
            onChange={(e) => updateBranch(idx, { nextStepId: e.target.value })}
            className={selectClass}
          >
            <option value="">Go to step...</option>
            {otherSteps.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.id})</option>
            ))}
          </select>
        </div>
      ))}
      <button onClick={addBranch} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
        + Add branch
      </button>
    </div>
  );
}

function ConnectionPicker({
  connectorKey,
  tenantId,
  value,
  onChange,
}: {
  connectorKey: string;
  tenantId: string;
  value: string;
  onChange: (connectionId: string) => void;
}) {
  const [connections, setConnections] = useState<ConnectionSummary[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.listConnections(tenantId, connectorKey)
      .then(setConnections)
      .catch(() => setConnections([]))
      .finally(() => setLoading(false));
  }, [tenantId, connectorKey]);

  return (
    <FieldRow label="Connection">
      {loading ? (
        <p className="text-xs text-gray-400">Loading...</p>
      ) : connections.length === 0 ? (
        <div className="text-xs text-gray-400">
          No connections found.{' '}
          <a href="/connections" target="_blank" className="text-blue-600 hover:text-blue-800">
            Create one
          </a>
        </div>
      ) : (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={selectClass}
        >
          <option value="">Select connection...</option>
          {connections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}
    </FieldRow>
  );
}

const RETRYABLE_ERRORS = ['network', 'rateLimit', 'timeout', 'serverError'] as const;

function RetryPolicyEditor({
  policy,
  onChange,
}: {
  policy?: RetryPolicy;
  onChange: (policy?: RetryPolicy) => void;
}) {
  if (!policy) {
    return (
      <button
        onClick={() =>
          onChange({
            maxAttempts: 2,
            strategy: 'fixed',
            initialDelayMs: 1000,
            maxDelayMs: 5000,
            retryableErrors: ['network', 'timeout'],
          })
        }
        className="text-xs text-blue-600 hover:text-blue-800 font-medium"
      >
        + Add retry policy
      </button>
    );
  }

  const update = (changes: Partial<RetryPolicy>) => onChange({ ...policy, ...changes });

  return (
    <div className="bg-gray-50 rounded-lg p-2 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium text-gray-500">Retry Policy</span>
        <button onClick={() => onChange(undefined)} className="text-xs text-gray-400 hover:text-red-500">
          &times;
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-gray-400">Max Attempts</label>
          <input
            type="number"
            value={policy.maxAttempts}
            onChange={(e) => update({ maxAttempts: Number(e.target.value) })}
            className={inputClass}
            min={1}
          />
        </div>
        <div>
          <label className="text-[10px] text-gray-400">Strategy</label>
          <select
            value={policy.strategy}
            onChange={(e) => update({ strategy: e.target.value as RetryPolicy['strategy'] })}
            className={selectClass}
          >
            <option value="fixed">Fixed</option>
            <option value="exponential">Exponential</option>
            <option value="jitter">Jitter</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] text-gray-400">Initial Delay (ms)</label>
          <input
            type="number"
            value={policy.initialDelayMs}
            onChange={(e) => update({ initialDelayMs: Number(e.target.value) })}
            className={inputClass}
            min={0}
          />
        </div>
        <div>
          <label className="text-[10px] text-gray-400">Max Delay (ms)</label>
          <input
            type="number"
            value={policy.maxDelayMs}
            onChange={(e) => update({ maxDelayMs: Number(e.target.value) })}
            className={inputClass}
            min={0}
          />
        </div>
      </div>
      <div>
        <label className="text-[10px] text-gray-400">Retryable Errors</label>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {RETRYABLE_ERRORS.map((err) => (
            <label key={err} className="flex items-center gap-1 text-[10px] text-gray-600">
              <input
                type="checkbox"
                checked={policy.retryableErrors.includes(err)}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...policy.retryableErrors, err]
                    : policy.retryableErrors.filter((r) => r !== err);
                  update({ retryableErrors: next });
                }}
                className="rounded border-gray-300"
              />
              {err}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
