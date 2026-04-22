// Inviting empty state — replaces bland "אין פריטים" text.
// Centered icon in a sage circle, a title, a one-line description, and an
// optional primary action button.
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
    <div className="flex flex-col items-center justify-center text-center py-12 sm:py-16 px-4">
      <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-full bg-accent/40 flex items-center justify-center mb-4">
        <Icon className="h-7 w-7 sm:h-9 sm:w-9 text-accent-foreground" strokeWidth={1.5} />
      </div>
      <h3 className="text-lg sm:text-xl font-bold mb-1">{title}</h3>
      {description && <p className="text-sm text-muted-foreground max-w-sm mb-5">{description}</p>}
      <div className="flex flex-col sm:flex-row gap-2 w-full max-w-xs">
        {actionLabel && onAction && (
          <Button onClick={onAction} className="flex-1">{actionLabel}</Button>
        )}
        {secondaryLabel && onSecondary && (
          <Button variant="outline" onClick={onSecondary} className="flex-1">{secondaryLabel}</Button>
        )}
      </div>
    </div>
  );
}
