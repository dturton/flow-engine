import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { api } from '../api.js';
import FlowBuilder from '../components/flow-builder/FlowBuilder.js';
import LoadingSpinner from '../components/LoadingSpinner.js';
import type { FlowBuilderState, FlowErrorPolicy, StepDefinition } from '../components/flow-builder/useFlowBuilderState.js';

export default function CreateFlow() {
  const navigate = useNavigate();
  const { flowId } = useParams<{ flowId: string }>();
  const isEdit = !!flowId;
  const [initialState, setInitialState] = useState<Partial<FlowBuilderState> | null>(
    isEdit ? null : {},
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!flowId) return;
    const controller = new AbortController();
    api.getFlow(flowId)
      .then((flow) => {
        if (controller.signal.aborted) return;
        setInitialState({
          name: flow.name,
          description: flow.description ?? '',
          tenantId: flow.tenantId,
          tags: flow.tags ?? [],
          errorPolicy: flow.errorPolicy as FlowErrorPolicy,
          steps: flow.steps as unknown as StepDefinition[],
          functions: flow.functions ?? [],
        });
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Failed to load flow');
      });
    return () => controller.abort();
  }, [flowId]);

  const handleSubmit = async (definition: Record<string, unknown>) => {
    try {
      if (isEdit) {
        await api.updateFlow(flowId, definition);
        navigate(`/flows/${flowId}`);
      } else {
        const flow = await api.createFlow(definition);
        navigate(`/flows/${flow.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : (isEdit ? 'Update failed' : 'Create failed'));
      throw err;
    }
  };

  if (isEdit && initialState === null && !error) {
    return <div className="flex justify-center py-12"><LoadingSpinner size="lg" /></div>;
  }

  return (
    <div>
      <div className="mb-4">
        <Link to={isEdit ? `/flows/${flowId}` : '/'} className="text-sm text-blue-600 hover:text-blue-800">
          &larr; {isEdit ? 'Back to flow' : 'Back to flows'}
        </Link>
        <h1 className="text-2xl font-bold mt-2">{isEdit ? 'Edit Flow' : 'Create Flow'}</h1>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded p-3 text-red-700 text-sm" role="alert">
          {error}
        </div>
      )}

      {initialState !== null && (
        <FlowBuilder
          initialState={initialState}
          onSubmit={handleSubmit}
          submitLabel={isEdit ? 'Save Changes' : 'Create Flow'}
        />
      )}
    </div>
  );
}
