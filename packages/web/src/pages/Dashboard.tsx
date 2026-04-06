/**
 * Dashboard page.
 * Shows summary statistics (total flows, recent runs, failure count, success rate)
 * and a table of the 20 most recent runs across all flows.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type FlowSummary, type FlowRunSummary } from '../api.js';
import StatusBadge from '../components/StatusBadge.js';

/** Landing page with aggregate stats and a recent-runs table */
export default function Dashboard() {
  const [flows, setFlows] = useState<FlowSummary[]>([]);
  const [runs, setRuns] = useState<FlowRunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.listFlows(), api.listRecentRuns(20)])
      .then(([f, r]) => { setFlows(f); setRuns(r); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-gray-500">Loading...</p>;
  if (error) return <p className="text-red-600">Error: {error}</p>;

  const failedRuns = runs.filter((r) => r.status === 'failed');
  const completedRuns = runs.filter((r) => r.status === 'completed');
  const successRate = runs.length > 0
    ? Math.round((completedRuns.length / runs.length) * 100)
    : 0;

  const flowMap = new Map(flows.map((f) => [f.id, f.name]));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <Link
          to="/flows/new"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          Create Flow
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-lg shadow p-5">
          <p className="text-sm text-gray-500">Total Flows</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{flows.length}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-5">
          <p className="text-sm text-gray-500">Recent Runs</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{runs.length}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-5">
          <p className="text-sm text-gray-500">Failed Runs</p>
          <p className="text-3xl font-bold text-red-600 mt-1">{failedRuns.length}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-5">
          <p className="text-sm text-gray-500">Success Rate</p>
          <p className="text-3xl font-bold text-green-600 mt-1">{successRate}%</p>
        </div>
      </div>

      {/* Recent Runs */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Recent Runs</h2>
        {runs.length === 0 ? (
          <p className="text-gray-500">No runs yet. <Link to="/flows" className="text-blue-600 hover:text-blue-800">Create a flow</Link> and trigger it to get started.</p>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Run ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Flow</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Trigger</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Started</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {runs.map((run) => (
                  <tr key={run.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 text-sm">
                      <Link to={`/runs/${run.id}`} className="text-blue-600 hover:text-blue-800 font-mono">
                        {run.id.slice(0, 12)}...
                      </Link>
                    </td>
                    <td className="px-6 py-3 text-sm">
                      <Link to={`/flows/${run.flowId}`} className="text-blue-600 hover:text-blue-800">
                        {flowMap.get(run.flowId) ?? run.flowId.slice(0, 12)}
                      </Link>
                    </td>
                    <td className="px-6 py-3"><StatusBadge status={run.status} /></td>
                    <td className="px-6 py-3 text-sm text-gray-600">{run.trigger.type}</td>
                    <td className="px-6 py-3 text-sm text-gray-500">{new Date(run.startedAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
