/**
 * CollectorDialog - Prompts for collector name when marking item as collected
 * Supports autofill from last used collector name
 */

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { User, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface CollectorDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (collectorName: string) => void;
  itemDescription?: string;
}

export function CollectorDialog({ open, onClose, onConfirm, itemDescription }: CollectorDialogProps) {
  const [collectorName, setCollectorName] = useState('');
  const [lastCollector, setLastCollector] = useState<string | null>(null);
  const [recentCollectors, setRecentCollectors] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      loadLastCollector();
      loadRecentCollectors();
    }
  }, [open]);

  const loadLastCollector = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Note: last_collector_name column will be added by migration
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      const lastCollectorName = (profile as any)?.last_collector_name;
      if (lastCollectorName) {
        setLastCollector(lastCollectorName);
        setCollectorName(lastCollectorName);
      }
    } catch (err) {
      console.error('Failed to load last collector:', err);
    }
  };

  const loadRecentCollectors = async () => {
    try {
      // Note: collected_by column will be added by migration
      const { data } = await supabase
        .from('items')
        .select('*')
        .eq('collected', true)
        .order('updated_at', { ascending: false })
        .limit(20);

      if (data) {
        const collectors = data
          .map(d => (d as any).collected_by)
          .filter(Boolean);
        const unique = [...new Set(collectors)];
        setRecentCollectors(unique.slice(0, 5) as string[]);
      }
    } catch (err) {
      console.error('Failed to load recent collectors:', err);
    }
  };

  const handleConfirm = () => {
    if (collectorName.trim()) {
      onConfirm(collectorName.trim());
      setCollectorName('');
    }
  };

  const handleQuickSelect = (name: string) => {
    setCollectorName(name);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            נאסף על ידי מי?
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {itemDescription && (
            <p className="text-sm text-muted-foreground">
              פריט: <span className="font-medium text-foreground">{itemDescription}</span>
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="collector">שם האוסף</Label>
            <Input
              id="collector"
              value={collectorName}
              onChange={(e) => setCollectorName(e.target.value)}
              placeholder="הכנס שם..."
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
            />
          </div>

          {recentCollectors.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                אוספים אחרונים
              </Label>
              <div className="flex flex-wrap gap-2">
                {recentCollectors.map((name) => (
                  <Button
                    key={name}
                    variant={collectorName === name ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handleQuickSelect(name)}
                    className="text-xs"
                  >
                    {name}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose}>
            ביטול
          </Button>
          <Button onClick={handleConfirm} disabled={!collectorName.trim()}>
            אישור
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
