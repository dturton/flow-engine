import { useEffect, useState, useCallback } from 'react';
import { api, type ConnectionSummary } from '../api.js';
import { CONNECTORS } from '../components/flow-builder/connectorConfig.js';

interface NewConnectionForm {
  connectorKey: string;
  name: string;
  description: string;
  credentials: Record<string, string>;
}

const EMPTY_FORM: NewConnectionForm = {
  connectorKey: '',
  name: '',
  description: '',
  credentials: {},
};

/** Credential fields required per connector */
const CREDENTIAL_FIELDS: Record<string, { key: string; label: string; placeholder: string; sensitive?: boolean; hint?: string }[]> = {
  shopify: [
    { key: 'storeUrl', label: 'Shop Domain', placeholder: 'my-store.myshopify.com' },
    { key: 'clientId', label: 'Client ID', placeholder: 'App client ID from Shopify Partners' },
    { key: 'clientSecret', label: 'Client Secret', placeholder: 'App client secret', sensitive: true },
    { key: 'accessToken', label: 'Access Token', placeholder: 'shpat_xxxxx (leave blank to use OAuth)', sensitive: true, hint: 'Optional — if blank, tokens are auto-obtained using Client ID/Secret' },
  ],
  http: [
    { key: 'baseUrl', label: 'Base URL', placeholder: 'https://api.example.com (optional)' },
    { key: 'apiKey', label: 'API Key', placeholder: 'Optional API key', sensitive: true },
  ],
};

export default function Connections() {
  const [tenantId, setTenantId] = useState('demo-tenant');
  const [tenantInput, setTenantInput] = useState('demo-tenant');
  const [connections, setConnections] = useState<ConnectionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewConnectionForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  const fetchConnections = useCallback(() => {
    setLoading(true);
    api.listConnections(tenantId)
      .then(setConnections)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [tenantId]);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  const handleCreate = async () => {
    setError(null);
    setSubmitting(true);
    try {
      // Filter out empty credential values
      const creds: Record<string, string> = {};
      for (const [k, v] of Object.entries(form.credentials)) {
        if (v.trim()) creds[k] = v.trim();
      }
      await api.createConnection({
        tenantId,
        connectorKey: form.connectorKey,
        name: form.name,
        description: form.description || undefined,
        credentials: creds,
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      fetchConnections();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete connection "${name}"? Flows using it will fail.`)) return;
    try {
      await api.deleteConnection(id);
      setConnections((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; message: string } | null>(null);

  const handleTest = async (id: string) => {
    setTestingId(id);
    setTestResult(null);
    try {
      const result = await api.testConnection(id);
      setTestResult({
        id,
        success: result.success,
        message: result.success ? result.message ?? 'Connected' : result.error ?? 'Test failed',
      });
    } catch (err) {
      setTestResult({
        id,
        success: false,
        message: err instanceof Error ? err.message : 'Test failed',
      });
    } finally {
      setTestingId(null);
    }
  };

  const credFields = CREDENTIAL_FIELDS[form.connectorKey] ?? [];
  const canSubmit = form.connectorKey && form.name.trim();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Connections</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          {showForm ? 'Cancel' : '+ New Connection'}
        </button>
      </div>

      {/* Tenant selector */}
      <div className="mb-6 flex items-center gap-2">
        <label className="text-sm font-medium text-gray-700">Tenant:</label>
        <input
          type="text"
          value={tenantInput}
          onChange={(e) => setTenantInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && tenantInput.trim()) {
              setTenantId(tenantInput.trim());
            }
          }}
          className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 w-48 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        <button
          onClick={() => tenantInput.trim() && setTenantId(tenantInput.trim())}
          disabled={tenantInput.trim() === tenantId}
          className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 text-sm font-medium"
        >
          Switch
        </button>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded p-3 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">New Connection</h2>
          <div className="space-y-4 max-w-lg">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Connector</label>
              <select
                value={form.connectorKey}
                onChange={(e) => setForm({ ...form, connectorKey: e.target.value, credentials: {} })}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select connector...</option>
                {CONNECTORS.filter((c) => c.requiresConnection).map((c) => (
                  <option key={c.key} value={c.key}>{c.label} — {c.description}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. My Shopify Store"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                placeholder="Optional"
              />
            </div>

            {credFields.length > 0 && (
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700">Credentials</label>
                {credFields.map((field) => (
                  <div key={field.key}>
                    <label className="block text-xs text-gray-500 mb-0.5">{field.label}</label>
                    <input
                      type={field.sensitive ? 'password' : 'text'}
                      value={form.credentials[field.key] ?? ''}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          credentials: { ...form.credentials, [field.key]: e.target.value },
                        })
                      }
                      className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 font-mono"
                      placeholder={field.placeholder}
                    />
                    {field.hint && (
                      <p className="text-[10px] text-gray-400 mt-0.5">{field.hint}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={handleCreate}
              disabled={!canSubmit || submitting}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
            >
              {submitting ? 'Creating...' : 'Create Connection'}
            </button>
          </div>
        </div>
      )}

      {/* Connections list */}
      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : connections.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          No connections yet. Create one to use connectors like Shopify in your flows.
        </div>
      ) : (
        <div className="space-y-3">
          {connections.map((conn) => {
            const connectorInfo = CONNECTORS.find((c) => c.key === conn.connectorKey);
            return (
              <div key={conn.id} className="bg-white rounded-lg shadow p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{conn.name}</span>
                      <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">
                        {connectorInfo?.label ?? conn.connectorKey}
                      </span>
                    </div>
                    {conn.description && (
                      <p className="text-sm text-gray-500 mt-0.5">{conn.description}</p>
                    )}
                    <div className="flex gap-4 mt-2 text-xs text-gray-400">
                      <span>ID: <code className="font-mono">{conn.id}</code></span>
                      <span>Created: {new Date(conn.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleTest(conn.id)}
                      disabled={testingId === conn.id}
                      className="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50"
                    >
                      {testingId === conn.id ? 'Testing...' : 'Test'}
                    </button>
                    <button
                      onClick={() => handleDelete(conn.id, conn.name)}
                      className="text-sm text-gray-400 hover:text-red-500"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                {testResult?.id === conn.id && (
                  <div className={`mt-2 text-sm rounded p-2 ${
                    testResult.success
                      ? 'bg-green-50 text-green-700'
                      : 'bg-red-50 text-red-700'
                  }`}>
                    {testResult.success ? '\u2713' : '\u2717'} {testResult.message}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
