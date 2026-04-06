import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../api.js';
import FunctionEditor, { type FlowFunction } from '../components/FunctionEditor.js';

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

type Tab = 'definition' | 'functions';

export default function CreateFlow() {
  const navigate = useNavigate();
  const [json, setJson] = useState(EXAMPLE_FLOW);
  const [functions, setFunctions] = useState<FlowFunction[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('definition');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const body = JSON.parse(json);
      if (functions.length > 0) {
        body.functions = functions;
      }
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

  const hasValidationErrors = functions.some((fn) => {
    if (!fn.name || !/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(fn.name)) return true;
    if (['inputs', 'context', 'output', 'console'].includes(fn.name)) return true;
    return false;
  });

  return (
    <div>
      <div className="mb-6">
        <Link to="/" className="text-sm text-blue-600 hover:text-blue-800">&larr; Back to flows</Link>
      </div>

      <h1 className="text-2xl font-bold mb-6">Create Flow</h1>

      <div className="bg-white rounded-lg shadow">
        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
            <button
              onClick={() => setActiveTab('definition')}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'definition'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Flow Definition
            </button>
            <button
              onClick={() => setActiveTab('functions')}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === 'functions'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Functions
              {functions.length > 0 && (
                <span className="bg-blue-100 text-blue-700 text-xs px-1.5 py-0.5 rounded-full">
                  {functions.length}
                </span>
              )}
            </button>
          </nav>
        </div>

        {/* Tab content */}
        <div className="p-6">
          {activeTab === 'definition' && (
            <div>
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
            </div>
          )}

          {activeTab === 'functions' && (
            <div>
              <div className="mb-4">
                <h3 className="text-sm font-medium text-gray-700">Custom Functions</h3>
                <p className="text-xs text-gray-500 mt-1">
                  Define reusable JavaScript functions that can be called from any <code className="bg-gray-100 px-1 rounded">script</code> step in this flow.
                </p>
              </div>
              <FunctionEditor functions={functions} onChange={setFunctions} />
            </div>
          )}

          {error && (
            <div className="mt-3 bg-red-50 border border-red-200 rounded p-3 text-red-700 text-sm">
              {error}
            </div>
          )}

          <div className="mt-4 flex gap-3">
            <button
              onClick={handleSubmit}
              disabled={submitting || hasValidationErrors}
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
    </div>
  );
}
