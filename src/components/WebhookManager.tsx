import { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Globe, Trash2, Plus, Check } from 'lucide-react';

interface WebhookEntry {
  id: string;
  url: string;
  label: string;
  active: boolean;
}

const STORAGE_KEY = 'fc_webhooks';

function loadHooks(): WebhookEntry[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored) as WebhookEntry[];
  } catch {
    return [];
  }
}

function saveHooks(hooks: WebhookEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(hooks));
}

export async function fireWebhooks(payload: Record<string, unknown>): Promise<void> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    const hooks: WebhookEntry[] = JSON.parse(stored);
    const active = hooks.filter(h => h.active);
    await Promise.allSettled(
      active.map(h =>
        fetch(h.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      )
    );
  } catch { /* non-blocking */ }
}

export function WebhookManager() {
  const [hooks, setHooks] = useState<WebhookEntry[]>(loadHooks);
  const [showForm, setShowForm] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [testingId, setTestingId] = useState<string | null>(null);

  const persist = (updated: WebhookEntry[]) => {
    setHooks(updated);
    saveHooks(updated);
  };

  const toggleActive = (id: string) => {
    persist(hooks.map(h => (h.id === id ? { ...h, active: !h.active } : h)));
  };

  const deleteHook = (id: string) => {
    persist(hooks.filter(h => h.id !== id));
  };

  const addHook = () => {
    const trimmedUrl = newUrl.trim();
    const trimmedLabel = newLabel.trim();
    if (!trimmedUrl.startsWith('https://')) {
      toast.error('הכתובת חייבת להתחיל ב־https://');
      return;
    }
    const entry: WebhookEntry = {
      id: crypto.randomUUID(),
      url: trimmedUrl,
      label: trimmedLabel || trimmedUrl,
      active: true,
    };
    persist([...hooks, entry]);
    setNewLabel('');
    setNewUrl('');
    setShowForm(false);
    toast.success('Webhook נוסף');
  };

  const testHook = async (hook: WebhookEntry) => {
    setTestingId(hook.id);
    try {
      const res = await fetch(hook.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'test', timestamp: Date.now() }),
      });
      if (res.ok) {
        toast.success(`Webhook נשלח בהצלחה (${res.status})`);
      } else {
        toast.error(`שגיאה מהשרת: ${res.status}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`שליחה נכשלה: ${msg}`);
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Globe className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold">Webhooks — התראות אוטומטיות</h2>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() => setShowForm(v => !v)}
        >
          <Plus className="h-3.5 w-3.5" />
          הוסף Webhook
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        הוסף כתובות URL שיופעלו אוטומטית כשדירה מסומנת כהושלמה.
      </p>

      {/* Inline add form */}
      {showForm && (
        <div className="rounded-lg border bg-muted/40 p-4 space-y-3">
          <div className="space-y-1">
            <Label htmlFor="wh-label">שם</Label>
            <Input
              id="wh-label"
              placeholder="שם webhook, למשל: Slack"
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              dir="ltr"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="wh-url">כתובת URL</Label>
            <Input
              id="wh-url"
              placeholder="https://..."
              value={newUrl}
              onChange={e => setNewUrl(e.target.value)}
              dir="ltr"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>
              ביטול
            </Button>
            <Button size="sm" className="gap-1.5" onClick={addHook}>
              <Check className="h-3.5 w-3.5" />
              הוסף
            </Button>
          </div>
        </div>
      )}

      {/* List */}
      {hooks.length === 0 && !showForm && (
        <p className="text-sm text-muted-foreground text-center py-4">
          אין Webhooks מוגדרים עדיין.
        </p>
      )}

      {hooks.length > 0 && (
        <ul className="space-y-2">
          {hooks.map(hook => (
            <li
              key={hook.id}
              className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2.5"
            >
              {/* Label + URL */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{hook.label}</p>
                <p className="text-xs text-muted-foreground truncate" dir="ltr">
                  {hook.url}
                </p>
              </div>

              {/* Active toggle */}
              <Switch
                checked={hook.active}
                onCheckedChange={() => toggleActive(hook.id)}
                aria-label={`הפעל ${hook.label}`}
              />

              {/* Test button */}
              <Button
                size="sm"
                variant="outline"
                className="shrink-0"
                disabled={testingId === hook.id}
                onClick={() => void testHook(hook)}
              >
                {testingId === hook.id ? '...' : 'בדוק'}
              </Button>

              {/* Delete */}
              <Button
                size="icon"
                variant="ghost"
                className="shrink-0 text-destructive hover:text-destructive h-8 w-8"
                onClick={() => deleteHook(hook.id)}
                aria-label="מחק webhook"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
