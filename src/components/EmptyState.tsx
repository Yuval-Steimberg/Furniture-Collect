import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  icon: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}

export function EmptyState({ icon: Icon, title, description, actionLabel, onAction, secondaryLabel, onSecondary }: Props) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 sm:py-16 px-6 animate-fade-in">
      <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-full bg-accent/30 flex items-center justify-center mb-5 ring-1 ring-accent/20">
        <Icon className="h-7 w-7 sm:h-9 sm:w-9 text-muted-foreground" strokeWidth={1.5} />
      </div>
      <h3 className="text-base sm:text-lg font-bold mb-1.5 text-foreground">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground max-w-xs mb-6 leading-relaxed">{description}</p>
      )}
      {(actionLabel || secondaryLabel) && (
        <div className="flex flex-col sm:flex-row gap-2 w-full max-w-[280px]">
          {actionLabel && onAction && (
            <Button onClick={onAction} className="flex-1 h-10">{actionLabel}</Button>
          )}
          {secondaryLabel && onSecondary && (
            <Button variant="outline" onClick={onSecondary} className="flex-1 h-10">{secondaryLabel}</Button>
          )}
        </div>
      )}
    </div>
  );
}
