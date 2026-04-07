import type { MappingExpression, StepDefinition } from './useFlowBuilderState.js';
import { PathAutocompleteInput } from './PathAutocomplete.js';

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
      {currentStep && allSteps ? (
        <PathAutocompleteInput
          value={expr.value}
          onChange={(v) => onUpdate(entryKey, { ...expr, value: v })}
          exprType={expr.type}
          currentStep={currentStep}
          allSteps={allSteps}
          multiline
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
      ) : (
        <textarea
          value={expr.value}
          onChange={(e) => onUpdate(entryKey, { ...expr, value: e.target.value })}
          rows={expr.value.includes('\n') ? 3 : 1}
          className="w-full text-xs font-mono border border-gray-300 rounded px-2 py-1 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 resize-y"
          placeholder="Value"
        />
      )}
    </div>
  );
}
