/**
 * OfflineBadge - Shows sync status indicator in the header
 * Displays pending/failed counts and allows retry
 */

import { useEffect, useState } from 'react';
import { Cloud, CloudOff, RefreshCw, Check, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import {
  getPendingCount,
  getFailedCount,
  retryFailedRecordings,
  retryFailedImages,
} from '@/lib/offlineQueue';
import { toast } from 'sonner';

interface SyncCounts {
  pending: number;
  failed: number;
}

export function OfflineBadge() {
  const { isOnline } = useNetworkStatus();
  const [counts, setCounts] = useState<SyncCounts>({ pending: 0, failed: 0 });
  const [retrying, setRetrying] = useState(false);

  const loadCounts = async () => {
    try {
      const [pending, failed] = await Promise.all([
        getPendingCount(),
        getFailedCount(),
      ]);
      setCounts({
        pending: pending.total,
        failed: failed.total,
      });
    } catch (err) {
      console.error('Failed to load offline counts:', err);
    }
  };

  useEffect(() => {
    loadCounts();
    // Refresh counts every 10 seconds
    const interval = setInterval(loadCounts, 10000);
    return () => clearInterval(interval);
  }, []);

  // Refresh counts when coming back online
  useEffect(() => {
    if (isOnline) {
      loadCounts();
    }
  }, [isOnline]);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      const [recordings, images] = await Promise.all([
        retryFailedRecordings(),
        retryFailedImages(),
      ]);
      const total = recordings + images;
      if (total > 0) {
        toast.success(`${total} פריטים הועברו לסנכרון מחדש`);
      }
      await loadCounts();
    } catch (err) {
      console.error('Retry failed:', err);
      toast.error('שגיאה בניסיון חוזר');
    } finally {
      setRetrying(false);
    }
  };

  // Don't show if everything is synced and online
  if (isOnline && counts.pending === 0 && counts.failed === 0) {
    return null;
  }

  // Determine badge state
  const hasFailures = counts.failed > 0;
  const hasPending = counts.pending > 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={`gap-1.5 h-8 px-2 ${
            !isOnline
              ? 'text-muted-foreground'
              : hasFailures
              ? 'text-destructive'
              : hasPending
              ? 'text-warning'
              : 'text-success'
          }`}
        >
          {!isOnline ? (
            <CloudOff className="h-4 w-4" />
          ) : hasFailures ? (
            <AlertTriangle className="h-4 w-4" />
          ) : hasPending ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          {(hasPending || hasFailures) && (
            <span className="text-xs font-medium">
              {counts.pending + counts.failed}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent dir="rtl" className="w-64 p-3" align="end">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            {isOnline ? (
              <Cloud className="h-4 w-4 text-success" />
            ) : (
              <CloudOff className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="text-sm font-medium">
              {isOnline ? 'מחובר' : 'לא מחובר'}
            </span>
          </div>

          {hasPending && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">ממתינים לסנכרון:</span>
              <span className="font-medium text-warning">{counts.pending}</span>
            </div>
          )}

          {hasFailures && (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">נכשלו:</span>
                <span className="font-medium text-destructive">{counts.failed}</span>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleRetry}
                disabled={retrying}
                className="w-full gap-2"
              >
                {retrying ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                נסה שוב
              </Button>
            </>
          )}

          {!hasPending && !hasFailures && isOnline && (
            <div className="text-sm text-muted-foreground text-center py-2">
              <Check className="h-5 w-5 mx-auto mb-1 text-success" />
              הכל מסונכרן
            </div>
          )}

          {!isOnline && (
            <p className="text-xs text-muted-foreground">
              ההקלטות והתמונות נשמרות מקומית ויסונכרנו כשתחזור לרשת.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
