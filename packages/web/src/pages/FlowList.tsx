import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type FlowSummary } from '../api.js';
import LoadingSpinner from '../components/LoadingSpinner.js';

export default function FlowList() {
  const [flows, setFlows] = useState<FlowSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api.listFlows()
      .then((f) => { if (!controller.signal.aborted) setFlows(f); })
      .catch((err) => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  if (loading) return <div className="flex justify-center py-12"><LoadingSpinner size="lg" /></div>;
  if (error) return <p className="text-red-600" role="alert">Error: {error}</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Flows</h1>
        <Link
          to="/flows/new"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          Create Flow
        </Link>
      </div>

      {flows.length === 0 ? (
        <p className="text-gray-500">No flows yet. Click "Create Flow" to get started.</p>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tenant</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Steps</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Version</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tags</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {flows.map((flow) => (
                  <tr key={flow.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Link to={`/flows/${flow.id}`} className="text-blue-600 hover:text-blue-800 font-medium">
                        {flow.name}
                      </Link>
                      {flow.description && (
                        <p className="text-sm text-gray-500 mt-0.5">{flow.description}</p>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{flow.tenantId}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{flow.steps.length}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">v{flow.version}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {flow.tags?.map((tag) => (
                        <span key={tag} className="inline-block bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded mr-1">
                          {tag}
                        </span>
                      ))}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(flow.updatedAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
