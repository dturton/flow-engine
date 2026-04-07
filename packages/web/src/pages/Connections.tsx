import { useEffect, useState, useCallback } from 'react';
import { api, type ConnectionSummary } from '../api.js';
import { CONNECTORS } from '../components/flow-builder/connectorConfig.js';
import LoadingSpinner from '../components/LoadingSpinner.js';
import Button from '../components/ui/Button.js';
import Input from '../components/ui/Input.js';
import ConfirmDialog from '../components/ui/ConfirmDialog.js';
import { useToast } from '../contexts/ToastContext.js';

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
  const { addToast } = useToast();
  const [tenantId, setTenantId] = useState('demo-tenant');
  const [tenantInput, setTenantInput] = useState('demo-tenant');
  const [connections, setConnections] = useState<ConnectionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewConnectionForm>(EMPTY_FORM);
  const [nameError, setNameError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const fetchConnections = useCallback(() => {
    setLoading(true);
    api.listConnections(tenantId)
      .then(setConnections)
      .catch((err) => addToast(err instanceof Error ? err.message : 'Failed to load', 'error'))
      .finally(() => setLoading(false));
  }, [tenantId, addToast]);

  useEffect(() => {
    const controller = new AbortController();
    fetchConnections();
    return () => controller.abort();
  }, [fetchConnections]);

  const handleCreate = async () => {
    if (!form.name.trim()) {
      setNameError('Name is required');
      return;
    }
    setNameError(null);
    setSubmitting(true);
    try {
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
      addToast('Connection created', 'success');
      fetchConnections();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Create failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.deleteConnection(deleteTarget.id);
      setConnections((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      addToast(`Connection "${deleteTarget.name}" deleted`, 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Delete failed', 'error');
    } finally {
      setDeleteTarget(null);
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
        <Button onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ New Connection'}
        </Button>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Connection"
        message={`Delete connection "${deleteTarget?.name}"? Flows using it will fail.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Tenant selector */}
      <div className="mb-6 flex items-center gap-2">
        <label htmlFor="tenant-input" className="text-sm font-medium text-gray-700">Tenant:</label>
        <input
          id="tenant-input"
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

      {/* Create form */}
      {showForm && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">New Connection</h2>
          <div className="space-y-4 max-w-lg">
            <div>
              <label htmlFor="connector-select" className="block text-sm font-medium text-gray-700 mb-1">Connector</label>
              <select
                id="connector-select"
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

            <Input
              label="Name"
              required
              value={form.name}
              onChange={(e) => {
                setForm({ ...form, name: e.target.value });
                if (nameError) setNameError(null);
              }}
              error={nameError ?? undefined}
              placeholder="e.g. My Shopify Store"
            />

            <Input
              label="Description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Optional"
            />

            {credFields.length > 0 && (
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700">Credentials</label>
                {credFields.map((field) => (
                  <div key={field.key}>
                    <label htmlFor={`cred-${field.key}`} className="block text-xs text-gray-500 mb-0.5">{field.label}</label>
                    <input
                      id={`cred-${field.key}`}
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

            <Button onClick={handleCreate} disabled={!canSubmit} loading={submitting}>
              Create Connection
            </Button>
          </div>
        </div>
      )}

      {/* Connections list */}
      {loading ? (
        <div className="flex justify-center py-12"><LoadingSpinner size="lg" /></div>
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
                      className="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50 inline-flex items-center gap-1"
                      aria-label={`Test connection ${conn.name}`}
                    >
                      {testingId === conn.id ? <><LoadingSpinner size="sm" /> Testing...</> : 'Test'}
                    </button>
                    <button
                      onClick={() => setDeleteTarget({ id: conn.id, name: conn.name })}
                      className="text-sm text-gray-400 hover:text-red-500"
                      aria-label={`Delete connection ${conn.name}`}
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
                  }`} role="alert">
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
