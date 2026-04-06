import FunctionEditor from '../FunctionEditor.js';
import FlowBuilderCanvas from './FlowBuilderCanvas.js';
import StepPalette from './StepPalette.js';
import StepConfigPanel from './StepConfigPanel.js';
import FlowSettingsBar from './FlowSettingsBar.js';
import JsonPreviewPanel from './JsonPreviewPanel.js';
import { stateToFlowDefinition } from './flowBuilderUtils.js';
import {
  useFlowBuilderState,
  type FlowBuilderState,
  type FlowFunction,
} from './useFlowBuilderState.js';

interface FlowBuilderProps {
  initialState?: Partial<FlowBuilderState>;
  onSubmit: (definition: Record<string, unknown>) => Promise<void>;
  submitLabel: string;
}

const tabClass = (active: boolean) =>
  `px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
    active
      ? 'border-blue-500 text-blue-600'
      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
  }`;

export default function FlowBuilder({ initialState, onSubmit, submitLabel }: FlowBuilderProps) {
  const [state, dispatch] = useFlowBuilderState(initialState);

  const selectedStep = state.selectedStepId
    ? state.steps.find((s) => s.id === state.selectedStepId) ?? null
    : null;

  const handleSubmit = async () => {
    const def = stateToFlowDefinition(state);
    await onSubmit(def);
  };

  const canSubmit = state.name.trim().length > 0 && state.steps.length > 0;

  return (
    <div className="bg-white rounded-lg shadow flex flex-col" style={{ height: 'calc(100vh - 160px)' }}>
      <FlowSettingsBar state={state} dispatch={dispatch} />

      {/* Main content area */}
      <div className="flex flex-1 min-h-0">
        {state.activeTab === 'canvas' && (
          <>
            <StepPalette />
            <FlowBuilderCanvas
              steps={state.steps}
              selectedStepId={state.selectedStepId}
              dispatch={dispatch}
            />
            {selectedStep && (
              <StepConfigPanel
                step={selectedStep}
                allSteps={state.steps}
                dispatch={dispatch}
              />
            )}
          </>
        )}

        {state.activeTab === 'functions' && (
          <div className="flex-1 p-6 overflow-y-auto">
            <div className="mb-4">
              <h3 className="text-sm font-medium text-gray-700">Custom Functions</h3>
              <p className="text-xs text-gray-500 mt-1">
                Define reusable JavaScript functions that can be called from any{' '}
                <code className="bg-gray-100 px-1 rounded">script</code> step in this flow.
              </p>
            </div>
            <FunctionEditor
              functions={state.functions}
              onChange={(fns: FlowFunction[]) => dispatch({ type: 'SET_FUNCTIONS', payload: fns })}
            />
          </div>
        )}

        {state.activeTab === 'json' && <JsonPreviewPanel state={state} />}
      </div>

      {/* Bottom bar */}
      <div className="border-t border-gray-200 px-4 py-2 flex items-center justify-between">
        <nav className="flex">
          <button
            onClick={() => dispatch({ type: 'SET_TAB', payload: 'canvas' })}
            className={tabClass(state.activeTab === 'canvas')}
          >
            Canvas
          </button>
          <button
            onClick={() => dispatch({ type: 'SET_TAB', payload: 'functions' })}
            className={tabClass(state.activeTab === 'functions')}
          >
            Functions
            {state.functions.length > 0 && (
              <span className="ml-1.5 bg-blue-100 text-blue-700 text-[10px] px-1.5 py-0.5 rounded-full">
                {state.functions.length}
              </span>
            )}
          </button>
          <button
            onClick={() => dispatch({ type: 'SET_TAB', payload: 'json' })}
            className={tabClass(state.activeTab === 'json')}
          >
            JSON Preview
          </button>
        </nav>

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">
            {state.steps.length} step{state.steps.length !== 1 ? 's' : ''}
          </span>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="px-4 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
