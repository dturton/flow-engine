import { Routes, Route, Link } from 'react-router-dom';
import FlowList from './pages/FlowList.js';
import FlowDetail from './pages/FlowDetail.js';
import RunDetail from './pages/RunDetail.js';
import CreateFlow from './pages/CreateFlow.js';

export default function App() {
  return (
    <div className="min-h-screen">
      <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-6">
        <Link to="/" className="text-lg font-semibold text-gray-900">
          Flow Engine
        </Link>
        <Link to="/" className="text-sm text-gray-600 hover:text-gray-900">
          Flows
        </Link>
      </nav>
      <main className="max-w-7xl mx-auto px-6 py-8">
        <Routes>
          <Route path="/" element={<FlowList />} />
          <Route path="/flows/new" element={<CreateFlow />} />
          <Route path="/flows/:flowId" element={<FlowDetail />} />
          <Route path="/runs/:runId" element={<RunDetail />} />
        </Routes>
      </main>
    </div>
  );
}
