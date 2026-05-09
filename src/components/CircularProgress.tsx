import { motion } from 'framer-motion';

interface Props {
  value: number; // 0–100
  size?: number;
  strokeWidth?: number;
  color?: 'primary' | 'success' | 'accent';
  showLabel?: boolean;
  className?: string;
}

export function CircularProgress({ value, size = 48, strokeWidth = 4, color = 'primary', showLabel = true, className = '' }: Props) {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(value, 100) / 100) * circ;
  const colorMap = { primary: 'stroke-primary', success: 'stroke-emerald-500', accent: 'stroke-accent' } as const;

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={strokeWidth} className="stroke-muted" />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={strokeWidth} strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.9, ease: [0.2, 0.7, 0.2, 1] }}
          className={colorMap[color]}
        />
      </svg>
      {showLabel && (
        <span className="absolute font-bold tabular-nums" style={{ fontSize: size < 44 ? '9px' : '11px' }}>
          {Math.round(value)}%
        </span>
      )}
    </div>
  );
}
