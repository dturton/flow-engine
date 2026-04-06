import { STEP_TYPES, type StepTypeInfo } from './stepTypeConfig.js';

function PaletteItem({ info }: { info: StepTypeInfo }) {
  const onDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/flow-step-type', info.type);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className={`px-3 py-2 rounded-lg border cursor-grab active:cursor-grabbing ${info.bgColor} ${info.borderColor} ${info.color} hover:shadow-sm transition-shadow`}
    >
      <div className="text-xs font-semibold">{info.label}</div>
      <div className="text-[10px] opacity-75">{info.description}</div>
    </div>
  );
}

export default function StepPalette() {
  return (
    <div className="w-44 flex-shrink-0 border-r border-gray-200 bg-gray-50 p-3 flex flex-col gap-2">
      <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
        Step Types
      </div>
      {STEP_TYPES.map((info) => (
        <PaletteItem key={info.type} info={info} />
      ))}
      <div className="mt-auto text-[10px] text-gray-400 text-center">
        Drag onto canvas
      </div>
    </div>
  );
}
