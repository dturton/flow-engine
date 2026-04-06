import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import type { MappingExpression, StepDefinition } from './useFlowBuilderState.js';

const EXPRESSION_TYPES: MappingExpression['type'][] = ['literal', 'jsonata', 'jsonpath', 'template'];

interface InputMappingEditorProps {
  mapping: Record<string, MappingExpression | string>;
  onChange: (mapping: Record<string, MappingExpression | string>) => void;
  excludeKeys?: string[];
  currentStep?: StepDefinition;
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

// ─── Autocomplete tree ────────────────────────────────────────────────────────

interface CompletionItem {
  /** Text to insert */
  value: string;
  /** Display label */
  label: string;
  /** Optional description shown next to label */
  hint?: string;
}

/**
 * Build a virtual path tree for autocompletion.
 * Given the current typed path prefix, returns the next-level completions.
 *
 * Tree structure:
 *   trigger
 *     data  → (leaf — user continues with their own keys)
 *   steps
 *     <stepId>  (for each upstream step)
 *       data  → (leaf)
 *   variables → (leaf)
 */
function getCompletions(
  typedPath: string,
  exprType: MappingExpression['type'],
  currentStep: StepDefinition | undefined,
  allSteps: StepDefinition[] | undefined,
): CompletionItem[] {
  if (!currentStep || !allSteps || exprType === 'literal') return [];

  const upstreamIds = getUpstreamStepIds(currentStep.id, allSteps);
  const stepMap = new Map(allSteps.map((s) => [s.id, s]));

  // Normalize the typed value to a bare dot-path for tree traversal
  let bare = typedPath;
  if (exprType === 'jsonpath') {
    // Strip leading $. or $
    bare = bare.replace(/^\$\.?/, '');
  } else if (exprType === 'template') {
    // Extract path from inside {{ }}
    const match = bare.match(/\{\{(.*)$/);
    bare = match ? match[1] : bare;
  }

  const parts = bare.split('.');
  // The last part is what the user is currently typing (partial match)
  const partial = parts.pop() ?? '';
  const resolved = parts; // fully typed segments

  // Build the tree nodes at the current level
  type TreeNode = { children?: Record<string, { hint?: string; children?: Record<string, { hint?: string }> }>, hint?: string };

  const stepsChildren: Record<string, { hint?: string; children?: Record<string, { hint?: string }> }> = {};
  for (const id of upstreamIds) {
    const step = stepMap.get(id);
    stepsChildren[id] = {
      hint: step ? step.name : id,
      children: {
        data: { hint: 'step output' },
      },
    };
  }

  const tree: Record<string, TreeNode> = {
    trigger: {
      hint: 'trigger payload',
      children: {
        type: { hint: 'trigger type' },
        data: { hint: 'trigger data' },
      },
    },
    steps: {
      hint: `${upstreamIds.length} upstream step(s)`,
      children: stepsChildren,
    },
    variables: {
      hint: 'flow variables',
    },
  };

  // Walk into the tree following resolved segments
  let current: Record<string, TreeNode> | undefined = tree;
  for (const segment of resolved) {
    const node = current?.[segment];
    if (!node || !node.children) {
      // Past a leaf — no more completions
      return [];
    }
    current = node.children as Record<string, TreeNode>;
  }

  if (!current) return [];

  // Filter children by partial match
  const candidates = Object.entries(current)
    .filter(([key]) => key.toLowerCase().startsWith(partial.toLowerCase()))
    .map(([key, node]) => {
      // Build the full path to insert
      const fullSegments = [...resolved, key];
      let insertPath: string;
      switch (exprType) {
        case 'jsonpath':
          insertPath = `$.${fullSegments.join('.')}`;
          break;
        case 'template':
          insertPath = `{{${fullSegments.join('.')}}}`;
          break;
        default:
          insertPath = fullSegments.join('.');
          break;
      }

      return {
        value: insertPath,
        label: key,
        hint: (node as TreeNode).hint,
      };
    });

  return candidates;
}

// ─── Autocomplete dropdown ────────────────────────────────────────────────────

function AutocompleteDropdown({
  items,
  selectedIndex,
  onSelect,
}: {
  items: CompletionItem[];
  selectedIndex: number;
  onSelect: (item: CompletionItem) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div className="absolute left-0 right-0 top-full z-10 mt-0.5 bg-white border border-gray-300 rounded-lg shadow-lg overflow-hidden max-h-48 overflow-y-auto">
      {items.map((item, idx) => (
        <button
          key={item.value}
          onMouseDown={(e) => {
            e.preventDefault(); // prevent blur
            onSelect(item);
          }}
          className={`w-full text-left px-2.5 py-1.5 flex items-center justify-between text-xs ${
            idx === selectedIndex
              ? 'bg-blue-50 text-blue-800'
              : 'text-gray-700 hover:bg-gray-50'
          }`}
        >
          <span className="font-mono font-medium">{item.label}</span>
          {item.hint && (
            <span className="text-[10px] text-gray-400 ml-2 truncate">{item.hint}</span>
          )}
        </button>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function InputMappingEditor({
  mapping,
  onChange,
  excludeKeys = [],
  currentStep,
  allSteps,
}: InputMappingEditorProps) {
  const entries = Object.entries(mapping).filter(([k]) => !excludeKeys.includes(k));

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
  onUpdate,
  onRemove,
  currentStep,
  allSteps,
}: {
  entryKey: string;
  expr: MappingExpression;
  onUpdate: (key: string, expr: MappingExpression) => void;
  onRemove: () => void;
  currentStep?: StepDefinition;
  allSteps?: StepDefinition[];
}) {
  const [isFocused, setIsFocused] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const completions = useMemo(
    () => getCompletions(expr.value, expr.type, currentStep, allSteps),
    [expr.value, expr.type, currentStep, allSteps],
  );

  const showDropdown = isFocused && completions.length > 0;

  // Reset selection when completions change
  useEffect(() => {
    setSelectedIndex(0);
  }, [completions]);

  const selectCompletion = useCallback(
    (item: CompletionItem) => {
      onUpdate(entryKey, { ...expr, value: item.value });
      // Keep focus on the textarea
      textareaRef.current?.focus();
    },
    [entryKey, expr, onUpdate],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!showDropdown) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, completions.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Tab' || e.key === 'Enter') {
        if (completions[selectedIndex]) {
          e.preventDefault();
          selectCompletion(completions[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        setIsFocused(false);
      }
    },
    [showDropdown, completions, selectedIndex, selectCompletion],
  );

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
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={expr.value}
          onChange={(e) => onUpdate(entryKey, { ...expr, value: e.target.value })}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setTimeout(() => setIsFocused(false), 200)}
          onKeyDown={handleKeyDown}
          rows={expr.value.includes('\n') ? 3 : 1}
          className="w-full text-xs font-mono border border-gray-300 rounded px-2 py-1 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 resize-y"
          placeholder={
            expr.type === 'literal'
              ? 'Value'
              : expr.type === 'jsonpath'
                ? 'Type $. to see available paths'
                : expr.type === 'jsonata'
                  ? 'Type to see available paths'
                  : expr.type === 'template'
                    ? 'Type {{ to see available paths'
                    : `${expr.type} expression...`
          }
        />
        {showDropdown && (
          <AutocompleteDropdown
            items={completions}
            selectedIndex={selectedIndex}
            onSelect={selectCompletion}
          />
        )}
      </div>
    </div>
  );
}
