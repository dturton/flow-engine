/**
 * Color-coded pill badge for displaying execution statuses.
 * Used across run tables, step details, and the flow graph.
 */

/** Maps status strings to Tailwind background/text color classes */
const statusColors: Record<string, string> = {
  queued: 'bg-gray-100 text-gray-700',
  running: 'bg-blue-100 text-blue-700',
  paused: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  cancelled: 'bg-orange-100 text-orange-700',
  pending: 'bg-gray-100 text-gray-600',
  skipped: 'bg-gray-100 text-gray-500',
  retrying: 'bg-yellow-100 text-yellow-700',
};

/** Renders a colored pill showing the given status text */
export default function StatusBadge({ status }: { status: string }) {
  const color = statusColors[status] ?? 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {status}
    </span>
  );
}
