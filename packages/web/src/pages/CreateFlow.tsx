import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../api.js';

const EXAMPLE_FLOW = JSON.stringify({
  name: 'My Flow',
  tenantId: 'demo-tenant',
  steps: [
    {
      id: 'step_1',
      name: 'First Step',
      type: 'transform',
      dependsOn: [],
      inputMapping: {
        value: { type: 'jsonata', value: 'trigger.data' }
      }
    }
  ],
  errorPolicy: { onStepFailure: 'halt' },
  tags: ['example']
}, null, 2);

export default function CreateFlow() {
  const navigate = useNavigate();
  const [json, setJson] = useState(EXAMPLE_FLOW);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const body = JSON.parse(json);
      const flow = await api.createFlow(body);
      navigate(`/flows/${flow.id}`);
    } catch (err) {
      if (err instanceof SyntaxError) {
        setError('Invalid JSON: ' + err.message);
      } else {
        setError(err instanceof Error ? err.message : 'Create failed');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <Link to="/" className="text-sm text-blue-600 hover:text-blue-800">&larr; Back to flows</Link>
      </div>

      <h1 className="text-2xl font-bold mb-6">Create Flow</h1>

      <div className="bg-white rounded-lg shadow p-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Flow Definition (JSON)
        </label>
        <textarea
          value={json}
          onChange={(e) => setJson(e.target.value)}
          rows={24}
          className="w-full font-mono text-sm border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          spellCheck={false}
        />

        {error && (
          <div className="mt-3 bg-red-50 border border-red-200 rounded p-3 text-red-700 text-sm">
            {error}
          </div>
        )}

        <div className="mt-4 flex gap-3">
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
          >
            {submitting ? 'Creating...' : 'Create Flow'}
          </button>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
