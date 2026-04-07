import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import type { MappingExpression, StepDefinition } from './useFlowBuilderState.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CompletionItem {
  /** Text to insert */
  value: string;
  /** Display label */
  label: string;
  /** Optional description shown next to label */
  hint?: string;
}

type ExpressionType = MappingExpression['type'];

// ─── Upstream resolution ─────────────────────────────────────────────────────

/** Walk dependsOn transitively to find all upstream step IDs */
export function getUpstreamStepIds(stepId: string, allSteps: StepDefinition[]): string[] {
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

// ─── Autocomplete tree ───────────────────────────────────────────────────────

type TreeNode = {
  children?: Record<string, TreeNode>;
  hint?: string;
};

/**
 * Build a virtual path tree for autocompletion.
 * Given the current typed path prefix, returns the next-level completions.
 *
 * Tree structure:
 *   trigger
 *     type
 *     data  → (leaf — user continues with their own keys)
 *   steps
 *     <stepId>  (for each upstream step)
 *       data  → (leaf)
 *   variables → (leaf)
 */
export function getCompletions(
  typedPath: string,
  exprType: ExpressionType,
  currentStep: StepDefinition | undefined,
  allSteps: StepDefinition[] | undefined,
): CompletionItem[] {
  if (!currentStep || !allSteps || exprType === 'literal') return [];

  const upstreamIds = getUpstreamStepIds(currentStep.id, allSteps);
  const stepMap = new Map(allSteps.map((s) => [s.id, s]));

  // Normalize the typed value to a bare dot-path for tree traversal
  let bare = typedPath;
  if (exprType === 'jsonpath') {
    bare = bare.replace(/^\$\.?/, '');
  } else if (exprType === 'template') {
    const match = bare.match(/\{\{(.*)$/);
    bare = match ? match[1] : bare;
  }

  const parts = bare.split('.');
  const partial = parts.pop() ?? '';
  const resolved = parts;

  const stepsChildren: Record<string, TreeNode> = {};
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
    const node: TreeNode | undefined = current?.[segment];
    if (!node || !node.children) return [];
    current = node.children;
  }

  if (!current) return [];

  return Object.entries(current as Record<string, TreeNode>)
    .filter(([key]) => key.toLowerCase().startsWith(partial.toLowerCase()))
    .map(([key, node]: [string, TreeNode]) => {
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
      return { value: insertPath, label: key, hint: node.hint };
    });
}

// ─── Autocomplete dropdown ───────────────────────────────────────────────────

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
            e.preventDefault();
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

// ─── Reusable autocomplete input ─────────────────────────────────────────────

interface PathAutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  exprType: ExpressionType;
  currentStep: StepDefinition;
  allSteps: StepDefinition[];
  placeholder?: string;
  className?: string;
  /** Use textarea instead of input for multi-line support */
  multiline?: boolean;
  rows?: number;
}

export function PathAutocompleteInput({
  value,
  onChange,
  exprType,
  currentStep,
  allSteps,
  placeholder,
  className = '',
  multiline = false,
  rows = 1,
}: PathAutocompleteInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  const completions = useMemo(
    () => getCompletions(value, exprType, currentStep, allSteps),
    [value, exprType, currentStep, allSteps],
  );

  const showDropdown = isFocused && completions.length > 0;

  useEffect(() => {
    setSelectedIndex(0);
  }, [completions]);

  const selectCompletion = useCallback(
    (item: CompletionItem) => {
      onChange(item.value);
      inputRef.current?.focus();
    },
    [onChange],
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

  const commonProps = {
    value,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value),
    onFocus: () => setIsFocused(true),
    onBlur: () => setTimeout(() => setIsFocused(false), 200),
    onKeyDown: handleKeyDown,
    placeholder,
    className,
  };

  return (
    <div className="relative">
      {multiline ? (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          rows={rows}
          {...commonProps}
        />
      ) : (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type="text"
          {...commonProps}
        />
      )}
      {showDropdown && (
        <AutocompleteDropdown
          items={completions}
          selectedIndex={selectedIndex}
          onSelect={selectCompletion}
        />
      )}
    </div>
  );
}
