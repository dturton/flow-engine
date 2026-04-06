import { useState } from 'react';
import type { FlowBuilderState, FlowBuilderAction, FlowErrorPolicy } from './useFlowBuilderState.js';

interface FlowSettingsBarProps {
  state: FlowBuilderState;
  dispatch: React.Dispatch<FlowBuilderAction>;
}

export default function FlowSettingsBar({ state, dispatch }: FlowSettingsBarProps) {
  const [tagInput, setTagInput] = useState('');

  const setMeta = (payload: Partial<Pick<FlowBuilderState, 'name' | 'description' | 'tenantId' | 'tags' | 'errorPolicy'>>) => {
    dispatch({ type: 'SET_METADATA', payload });
  };

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !state.tags.includes(trimmed)) {
      setMeta({ tags: [...state.tags, trimmed] });
    }
    setTagInput('');
  };

  const removeTag = (tag: string) => {
    setMeta({ tags: state.tags.filter((t) => t !== tag) });
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(tagInput);
    } else if (e.key === 'Backspace' && !tagInput && state.tags.length > 0) {
      removeTag(state.tags[state.tags.length - 1]);
    }
  };

  return (
    <div className="bg-white border-b border-gray-200 px-4 py-3 flex flex-wrap items-center gap-3">
      <input
        type="text"
        value={state.name}
        onChange={(e) => setMeta({ name: e.target.value })}
        placeholder="Flow name"
        className="text-sm font-medium border border-gray-300 rounded-lg px-3 py-1.5 w-48 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      />

      <input
        type="text"
        value={state.description}
        onChange={(e) => setMeta({ description: e.target.value })}
        placeholder="Description"
        className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 w-56 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      />

      <input
        type="text"
        value={state.tenantId}
        onChange={(e) => setMeta({ tenantId: e.target.value })}
        placeholder="Tenant ID"
        className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 w-36 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      />

      <div className="flex items-center gap-1 border border-gray-300 rounded-lg px-2 py-1 min-w-[120px] flex-wrap">
        {state.tags.map((tag) => (
          <span
            key={tag}
            className="bg-blue-100 text-blue-700 text-xs px-1.5 py-0.5 rounded flex items-center gap-1"
          >
            {tag}
            <button onClick={() => removeTag(tag)} className="hover:text-blue-900">&times;</button>
          </span>
        ))}
        <input
          type="text"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={handleTagKeyDown}
          onBlur={() => tagInput && addTag(tagInput)}
          placeholder={state.tags.length === 0 ? 'Tags...' : ''}
          className="text-xs border-0 outline-none flex-1 min-w-[60px] py-0.5"
        />
      </div>

      <div className="flex items-center gap-2 ml-auto">
        <label className="text-xs text-gray-500">On failure:</label>
        <select
          value={state.errorPolicy.onStepFailure}
          onChange={(e) => {
            const onStepFailure = e.target.value as FlowErrorPolicy['onStepFailure'];
            const policy: FlowErrorPolicy = { onStepFailure };
            if (onStepFailure === 'goto') policy.errorStepId = '';
            setMeta({ errorPolicy: policy });
          }}
          className="text-xs border border-gray-300 rounded px-2 py-1 bg-white focus:ring-1 focus:ring-blue-500"
        >
          <option value="halt">Halt</option>
          <option value="continue">Continue</option>
          <option value="goto">Go to step</option>
        </select>
        {state.errorPolicy.onStepFailure === 'goto' && (
          <select
            value={state.errorPolicy.errorStepId ?? ''}
            onChange={(e) =>
              setMeta({ errorPolicy: { ...state.errorPolicy, errorStepId: e.target.value } })
            }
            className="text-xs border border-gray-300 rounded px-2 py-1 bg-white focus:ring-1 focus:ring-blue-500"
          >
            <option value="">Select step...</option>
            {state.steps.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
