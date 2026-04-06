import CodeEditor from '../CodeEditor.js';
import { stateToFlowDefinition } from './flowBuilderUtils.js';
import type { FlowBuilderState } from './useFlowBuilderState.js';

interface JsonPreviewPanelProps {
  state: FlowBuilderState;
}

export default function JsonPreviewPanel({ state }: JsonPreviewPanelProps) {
  const json = JSON.stringify(stateToFlowDefinition(state), null, 2);
  return (
    <div className="flex-1 p-4">
      <CodeEditor value={json} onChange={() => {}} readOnly height="100%" />
    </div>
  );
}
