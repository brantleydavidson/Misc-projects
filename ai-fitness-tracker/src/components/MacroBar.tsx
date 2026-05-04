interface MacroBarProps {
  label: string;
  value: number;
  target: number;
  color: string;
  unit?: string;
}

export function MacroBar({ label, value, target, color, unit = 'g' }: MacroBarProps) {
  const pct = Math.min((value / target) * 100, 100);
  const remaining = Math.max(target - value, 0);

  return (
    <div className="flex-1">
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-xs font-medium text-slate-300">{label}</span>
        <span className="text-xs text-slate-500 font-data">{Math.round(value)}/{target}{unit}</span>
      </div>
      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <div className="text-[10px] text-slate-500 mt-0.5 font-data">{Math.round(remaining)}{unit} left</div>
    </div>
  );
}
