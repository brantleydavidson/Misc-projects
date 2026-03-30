interface ProgressRingProps {
  value: number;
  max: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  bgColor?: string;
  label?: string;
  unit?: string;
  children?: React.ReactNode;
}

export function ProgressRing({
  value, max, size = 120, strokeWidth = 8,
  color = '#22d3ee', bgColor = 'rgba(255,255,255,0.1)',
  label, unit = '', children
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(value / max, 1);
  const offset = circumference * (1 - progress);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={bgColor} strokeWidth={strokeWidth} />
        <circle cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeLinecap="round" strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700 ease-out" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {children || (
          <>
            <span className="text-lg font-bold text-white">{Math.round(value)}</span>
            {unit && <span className="text-[10px] text-slate-400">{unit}</span>}
            {label && <span className="text-[10px] text-slate-400">{label}</span>}
          </>
        )}
      </div>
    </div>
  );
}
