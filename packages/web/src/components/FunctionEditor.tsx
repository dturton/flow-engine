import { useState } from 'react';
import CodeEditor from './CodeEditor.js';

export interface FlowFunction {
  name: string;
  params: string[];
  body: string;
}

interface FunctionEditorProps {
  functions: FlowFunction[];
  onChange: (functions: FlowFunction[]) => void;
  readOnly?: boolean;
}

function ParamChips({
  params,
  onChange,
  readOnly,
}: {
  params: string[];
  onChange: (params: string[]) => void;
  readOnly?: boolean;
}) {
  const [draft, setDraft] = useState('');

  const addParam = () => {
    const trimmed = draft.trim();
    if (!trimmed || params.includes(trimmed)) return;
    if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(trimmed)) return;
    onChange([...params, trimmed]);
    setDraft('');
  };

  const removeParam = (index: number) => {
    onChange(params.filter((_, i) => i !== index));
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {params.map((p, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 text-xs font-mono px-2 py-0.5 rounded"
        >
          {p}
          {!readOnly && (
            <button
              onClick={() => removeParam(i)}
              className="text-blue-500 hover:text-blue-700 font-bold leading-none"
            >
              &times;
            </button>
          )}
        </span>
      ))}
      {!readOnly && (
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              addParam();
            }
            if (e.key === 'Backspace' && draft === '' && params.length > 0) {
              removeParam(params.length - 1);
            }
          }}
          placeholder="Add param..."
          className="text-xs font-mono bg-transparent border-b border-gray-300 focus:border-blue-500 outline-none px-1 py-0.5 w-24"
        />
      )}
    </div>
  );
}

function FunctionCard({
  fn,
  index,
  onUpdate,
  onDelete,
  isExpanded,
  onToggle,
  readOnly,
  validationError,
}: {
  fn: FlowFunction;
  index: number;
  onUpdate: (index: number, fn: FlowFunction) => void;
  onDelete: (index: number) => void;
  isExpanded: boolean;
  onToggle: () => void;
  readOnly?: boolean;
  validationError?: string;
}) {
  return (
    <div className={`border rounded-lg ${validationError ? 'border-red-400' : 'border-gray-200'} bg-white overflow-hidden`}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2.5 bg-gray-50 cursor-pointer hover:bg-gray-100 select-none"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          <span className="text-gray-400 text-xs">{isExpanded ? '▼' : '▶'}</span>
          <span className="font-mono text-sm font-medium text-gray-800">
            {fn.name || <span className="text-gray-400 italic">unnamed</span>}
          </span>
          <span className="text-xs text-gray-400">
            ({fn.params.join(', ')})
          </span>
        </div>
        {!readOnly && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(index);
            }}
            className="text-gray-400 hover:text-red-500 text-sm px-1"
            title="Delete function"
          >
            &times;
          </button>
        )}
      </div>

      {/* Expanded body */}
      {isExpanded && (
        <div className="p-4 space-y-3 border-t border-gray-200">
          {validationError && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">
              {validationError}
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
            {readOnly ? (
              <span className="font-mono text-sm">{fn.name}</span>
            ) : (
              <input
                type="text"
                value={fn.name}
                onChange={(e) => onUpdate(index, { ...fn, name: e.target.value })}
                className="w-full font-mono text-sm border border-gray-300 rounded px-2 py-1.5 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                placeholder="functionName"
              />
            )}
          </div>

          {/* Params */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Parameters</label>
            <ParamChips
              params={fn.params}
              onChange={(params) => onUpdate(index, { ...fn, params })}
              readOnly={readOnly}
            />
          </div>

          {/* Body */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Body</label>
            <CodeEditor
              value={fn.body}
              onChange={(body) => onUpdate(index, { ...fn, body })}
              placeholder="return value;"
              height="140px"
              readOnly={readOnly}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function FunctionEditor({ functions, onChange, readOnly }: FunctionEditorProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(
    functions.length > 0 ? 0 : null
  );

  const identifierPattern = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;
  const reservedNames = new Set(['inputs', 'context', 'output', 'console']);

  const getValidationError = (fn: FlowFunction, index: number): string | undefined => {
    if (!fn.name) return 'Function name is required';
    if (!identifierPattern.test(fn.name)) return 'Name must be a valid JavaScript identifier';
    if (reservedNames.has(fn.name)) return `"${fn.name}" is a reserved name`;
    const duplicate = functions.findIndex((f, i) => i !== index && f.name === fn.name);
    if (duplicate !== -1) return 'Duplicate function name';
    return undefined;
  };

  const addFunction = () => {
    const newFn: FlowFunction = { name: '', params: [], body: '' };
    const updated = [...functions, newFn];
    onChange(updated);
    setExpandedIndex(updated.length - 1);
  };

  const updateFunction = (index: number, fn: FlowFunction) => {
    const updated = [...functions];
    updated[index] = fn;
    onChange(updated);
  };

  const deleteFunction = (index: number) => {
    const updated = functions.filter((_, i) => i !== index);
    onChange(updated);
    if (expandedIndex === index) {
      setExpandedIndex(updated.length > 0 ? Math.min(index, updated.length - 1) : null);
    } else if (expandedIndex !== null && expandedIndex > index) {
      setExpandedIndex(expandedIndex - 1);
    }
  };

  return (
    <div className="space-y-3">
      {functions.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">
          No functions defined.{!readOnly && ' Click "Add Function" to create one.'}
        </div>
      ) : (
        functions.map((fn, i) => (
          <FunctionCard
            key={i}
            fn={fn}
            index={i}
            onUpdate={updateFunction}
            onDelete={deleteFunction}
            isExpanded={expandedIndex === i}
            onToggle={() => setExpandedIndex(expandedIndex === i ? null : i)}
            readOnly={readOnly}
            validationError={getValidationError(fn, i)}
          />
        ))
      )}

      {!readOnly && (
        <button
          onClick={addFunction}
          className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-blue-400 hover:text-blue-600 text-sm font-medium transition-colors"
        >
          + Add Function
        </button>
      )}
    </div>
  );
}
