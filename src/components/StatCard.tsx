// Hero statistic card — used on the dashboard + report.
// One per key metric. Big number, small label, optional sub-line and icon.
import type { LucideIcon } from 'lucide-react';

type Accent = 'orange' | 'sage' | 'forest' | 'slate';

const accentCls: Record<Accent, { ring: string; icon: string; value: string }> = {
  orange: { ring: 'border-primary/30 bg-primary/5', icon: 'bg-primary text-primary-foreground', value: 'text-primary' },
  sage:   { ring: 'border-accent bg-accent/30',     icon: 'bg-accent-foreground text-background', value: 'text-foreground' },
  forest: { ring: 'border-border bg-foreground',     icon: 'bg-background text-foreground',       value: 'text-background' },
  slate:  { ring: 'border-border bg-card',          icon: 'bg-muted text-muted-foreground',      value: 'text-foreground' },
};

interface Props {
  label: string;
  value: string | number;
  sub?: string;
  icon?: LucideIcon;
  accent?: Accent;
  onClick?: () => void;
}

export function StatCard({ label, value, sub, icon: Icon, accent = 'slate', onClick }: Props) {
  const a = accentCls[accent];
  const common = `relative rounded-xl p-4 sm:p-5 border transition-all ${a.ring} ${onClick ? 'hover:shadow-md cursor-pointer active:scale-[0.98]' : ''}`;
  const base = accent === 'forest' ? 'text-background' : 'text-foreground';
  const body = (
    <>
      <div className="flex items-start gap-3">
        {Icon && (
          <div className={`flex-shrink-0 h-9 w-9 rounded-lg flex items-center justify-center ${a.icon}`}>
            <Icon className="h-4 w-4" strokeWidth={1.75} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className={`text-xs uppercase tracking-wider font-semibold ${accent === 'forest' ? 'text-background/70' : 'text-muted-foreground'}`}>
            {label}
          </div>
          <div className={`mt-1 text-2xl sm:text-3xl font-extrabold leading-tight tabular-nums ${a.value} ${base}`}>
            {value}
          </div>
          {sub && (
            <div className={`mt-0.5 text-xs ${accent === 'forest' ? 'text-background/60' : 'text-muted-foreground'}`}>
              {sub}
            </div>
          )}
        </div>
      </div>
    </>
  );
  if (onClick) {
    return <button type="button" onClick={onClick} className={`${common} text-right w-full`}>{body}</button>;
  }
  return <div className={common}>{body}</div>;
}
