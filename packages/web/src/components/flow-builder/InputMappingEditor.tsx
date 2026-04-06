import { useState, useMemo } from 'react';
import type { MappingExpression, StepDefinition } from './useFlowBuilderState.js';

const EXPRESSION_TYPES: MappingExpression['type'][] = ['literal', 'jsonata', 'jsonpath', 'template'];

interface InputMappingEditorProps {
  mapping: Record<string, MappingExpression | string>;
  onChange: (mapping: Record<string, MappingExpression | string>) => void;
  excludeKeys?: string[];
  /** Current step being edited — used to compute available upstream paths */
  currentStep?: StepDefinition;
  /** All steps in the flow — used to resolve transitive dependencies */
  allSteps?: StepDefinition[];
}

function normalize(val: MappingExpression | string): MappingExpression {
  if (typeof val === 'string') return { type: 'literal', value: val };
  return val;
}

/** Walk dependsOn transitively to find all upstream step IDs */
function getUpstreamStepIds(stepId: string, allSteps: StepDefinition[]): string[] {
  const stepMap = new Map(allSteps.map((s) => [s.id, s]));
  const visited = new Set<string>();
  const queue = [...(stepMap.get(stepId)?.dependsOn ?? [])];
  while (queue.length > 0) {
    const id = queue.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const step = stepMap.get(id);
    if (step) queue.push(...step.dependsOn);
  }
  return Array.from(visited);
}

interface PathSuggestion {
  label: string;
  path: string;
  description: string;
}

function buildSuggestions(
  exprType: MappingExpression['type'],
  currentStep: StepDefinition,
  allSteps: StepDefinition[],
): PathSuggestion[] {
  if (exprType === 'literal') return [];

  const upstreamIds = getUpstreamStepIds(currentStep.id, allSteps);
  const stepMap = new Map(allSteps.map((s) => [s.id, s]));
  const suggestions: PathSuggestion[] = [];

  const fmt = (basePath: string) => {
    switch (exprType) {
      case 'jsonpath': return `$.${basePath}`;
      case 'jsonata': return basePath;
      case 'template': return `{{${basePath}}}`;
      default: return basePath;
    }
  };

  // Trigger paths — always available
  suggestions.push({
    label: 'trigger.data',
    path: fmt('trigger.data'),
    description: 'Trigger payload',
  });

  // Upstream step paths
  for (const id of upstreamIds) {
    const step = stepMap.get(id);
    if (!step) continue;
    suggestions.push({
      label: `${step.name}`,
      path: fmt(`steps.${id}.data`),
      description: `Output of "${step.name}"`,
    });
  }

  // Also suggest steps not in dependsOn (greyed out hint)
  // Skip — only suggest reachable steps to avoid runtime errors

  return suggestions;
}

function PathSuggestionsPanel({
  suggestions,
  onSelect,
  currentValue,
}: {
  suggestions: PathSuggestion[];
  onSelect: (path: string) => void;
  currentValue: string;
}) {
  if (suggestions.length === 0) return null;

  // Filter suggestions that match what the user is typing
  const filtered = currentValue
    ? suggestions.filter(
        (s) =>
          s.path.toLowerCase().includes(currentValue.toLowerCase()) ||
          s.label.toLowerCase().includes(currentValue.toLowerCase()),
      )
    : suggestions;

  if (filtered.length === 0 && currentValue) return null;

  const items = currentValue ? filtered : suggestions;

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {items.map((s) => (
        <button
          key={s.path}
          onClick={() => onSelect(s.path)}
          title={s.description}
          className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:border-blue-300 transition-colors truncate max-w-[200px]"
        >
          {s.path}
        </button>
      ))}
    </div>
  );
}

export default function InputMappingEditor({
  mapping,
  onChange,
  excludeKeys = [],
  currentStep,
  allSteps,
}: InputMappingEditorProps) {
  const entries = Object.entries(mapping).filter(([k]) => !excludeKeys.includes(k));
  const [focusedKey, setFocusedKey] = useState<string | null>(null);

  const update = (oldKey: string, newKey: string, expr: MappingExpression) => {
    const next = { ...mapping };
    if (oldKey !== newKey) delete next[oldKey];
    next[newKey] = expr;
    onChange(next);
  };

  const remove = (key: string) => {
    const next = { ...mapping };
    delete next[key];
    onChange(next);
  };

  const add = () => {
    const key = `input_${Object.keys(mapping).length + 1}`;
    onChange({ ...mapping, [key]: { type: 'literal', value: '' } });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
          Input Mapping
        </label>
        <button
          onClick={add}
          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
        >
          + Add
        </button>
      </div>

      {entries.length === 0 && (
        <p className="text-xs text-gray-400 italic">No inputs defined</p>
      )}

      {entries.map(([key, rawVal]) => {
        const expr = normalize(rawVal);
        return (
          <MappingEntry
            key={key}
            entryKey={key}
            expr={expr}
            isFocused={focusedKey === key}
            onFocus={() => setFocusedKey(key)}
            onBlur={() => setTimeout(() => setFocusedKey(null), 150)}
            onUpdate={(newKey, newExpr) => update(key, newKey, newExpr)}
            onRemove={() => remove(key)}
            currentStep={currentStep}
            allSteps={allSteps}
          />
        );
      })}
    </div>
  );
}

function MappingEntry({
  entryKey,
  expr,
  isFocused,
  onFocus,
  onBlur,
  onUpdate,
  onRemove,
  currentStep,
  allSteps,
}: {
  entryKey: string;
  expr: MappingExpression;
  isFocused: boolean;
  onFocus: () => void;
  onBlur: () => void;
  onUpdate: (key: string, expr: MappingExpression) => void;
  onRemove: () => void;
  currentStep?: StepDefinition;
  allSteps?: StepDefinition[];
}) {
  const suggestions = useMemo(() => {
    if (!currentStep || !allSteps) return [];
    return buildSuggestions(expr.type, currentStep, allSteps);
  }, [expr.type, currentStep, allSteps]);

  const showSuggestions = isFocused && suggestions.length > 0 && expr.type !== 'literal';

  return (
    <div className="bg-gray-50 rounded-lg p-2 space-y-1.5">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={entryKey}
          onChange={(e) => onUpdate(e.target.value, expr)}
          className="flex-1 text-xs font-mono border border-gray-300 rounded px-2 py-1 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          placeholder="Key"
        />
        <select
          value={expr.type}
          onChange={(e) =>
            onUpdate(entryKey, { ...expr, type: e.target.value as MappingExpression['type'] })
          }
          className="text-xs border border-gray-300 rounded px-2 py-1 bg-white focus:ring-1 focus:ring-blue-500"
        >
          {EXPRESSION_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <button
          onClick={onRemove}
          className="text-gray-400 hover:text-red-500 text-xs px-1"
          title="Remove"
        >
          &times;
        </button>
      </div>
      <textarea
        value={expr.value}
        onChange={(e) => onUpdate(entryKey, { ...expr, value: e.target.value })}
        onFocus={onFocus}
        onBlur={onBlur}
        rows={expr.value.includes('\n') ? 3 : 1}
        className="w-full text-xs font-mono border border-gray-300 rounded px-2 py-1 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 resize-y"
        placeholder={expr.type === 'literal' ? 'Value' : `${expr.type} expression...`}
      />
      {showSuggestions && (
        <PathSuggestionsPanel
          suggestions={suggestions}
          currentValue={expr.value}
          onSelect={(path) => onUpdate(entryKey, { ...expr, value: path })}
        />
      )}
    </div>
  );
}
