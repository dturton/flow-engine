interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'info';
  onDismiss: () => void;
}

const typeStyles = {
  success: 'bg-green-600 text-white',
  error: 'bg-red-600 text-white',
  info: 'bg-blue-600 text-white',
};

export default function Toast({ message, type, onDismiss }: ToastProps) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg min-w-[280px] max-w-sm ${typeStyles[type]}`}>
      <span className="flex-1 text-sm">{message}</span>
      <button
        onClick={onDismiss}
        className="text-white/80 hover:text-white text-lg leading-none shrink-0"
        aria-label="Dismiss notification"
      >
        &times;
      </button>
    </div>
  );
}
