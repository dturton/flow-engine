/**
 * Root application layout and route definitions.
 * Renders the top navigation bar and maps URL paths to page components.
 */

import { Routes, Route, Link } from 'react-router-dom';
import Dashboard from './pages/Dashboard.js';
import FlowList from './pages/FlowList.js';
import FlowDetail from './pages/FlowDetail.js';
import RunDetail from './pages/RunDetail.js';
import CreateFlow from './pages/CreateFlow.js';
import Connections from './pages/Connections.js';

/** Top-level layout with navigation and route outlet */
export default function App() {
  return (
    <div className="min-h-screen">
      <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-6">
        <Link to="/" className="text-lg font-semibold text-gray-900">
          Flow Engine
        </Link>
        <Link to="/" className="text-sm text-gray-600 hover:text-gray-900">
          Dashboard
        </Link>
        <Link to="/flows" className="text-sm text-gray-600 hover:text-gray-900">
          Flows
        </Link>
        <Link to="/connections" className="text-sm text-gray-600 hover:text-gray-900">
          Connections
        </Link>
      </nav>
      <main className="max-w-7xl mx-auto px-6 py-8">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/flows" element={<FlowList />} />
          <Route path="/flows/new" element={<CreateFlow />} />
          <Route path="/flows/:flowId" element={<FlowDetail />} />
          <Route path="/flows/:flowId/edit" element={<CreateFlow />} />
          <Route path="/connections" element={<Connections />} />
          <Route path="/runs/:runId" element={<RunDetail />} />
        </Routes>
      </main>
    </div>
  );
}
