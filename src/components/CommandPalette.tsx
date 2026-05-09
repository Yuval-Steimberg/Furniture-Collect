import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Building2, FolderOpen, Home, BarChart3, Plus, Search, LayoutDashboard, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface Result {
  id: string;
  type: 'project' | 'apartment';
  label: string;
  sub?: string;
  url: string;
  Icon: typeof Building2;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const QUICK = [
  { label: 'דף הבית', url: '/', Icon: Home },
  { label: 'הפרויקטים שלי', url: '/projects', Icon: FolderOpen },
  { label: 'סטטיסטיקות כלליות', url: '/global-statistics', Icon: BarChart3 },
  { label: 'חוקר נתונים', url: '/data-explorer', Icon: Search },
  { label: 'לוח בקרה', url: '/manager-dashboard', Icon: LayoutDashboard },
  { label: 'ניהול משתמשים', url: '/user-management', Icon: Users },
  { label: 'פרויקט חדש', url: '/projects/new', Icon: Plus },
];

export function CommandPalette({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all([
      supabase.from('projects').select('id,name,city').order('name').limit(25),
      supabase.from('apartments').select('id,project_id,building_number,apartment_number,projects(name)').order('building_number,apartment_number').limit(40),
    ]).then(([{ data: projs }, { data: apts }]) => {
      const pRes: Result[] = (projs ?? []).map(p => ({
        id: p.id, type: 'project', label: p.name, sub: p.city,
        url: `/projects/${p.id}`, Icon: FolderOpen,
      }));
      const aRes: Result[] = (apts ?? []).map((a: any) => ({
        id: a.id, type: 'apartment',
        label: `בניין ${a.building_number} · דירה ${a.apartment_number}`,
        sub: (a.projects as any)?.name,
        url: `/projects/${a.project_id}/apartments/${a.id}`,
        Icon: Building2,
      }));
      setResults([...pRes, ...aRes]);
    }).finally(() => setLoading(false));
  }, [open]);

  const go = (url: string) => { navigate(url); onOpenChange(false); };

  const projects = results.filter(r => r.type === 'project');
  const apartments = results.filter(r => r.type === 'apartment');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 max-w-lg overflow-hidden" dir="rtl">
        <Command className="rounded-lg border-0" shouldFilter>
          <CommandInput placeholder="חפש פרויקט, דירה, או נווט..." className="h-12 text-base" dir="rtl" />
          <CommandList className="max-h-[380px]">
            <CommandEmpty className="py-6 text-center text-sm text-muted-foreground">
              {loading ? 'טוען...' : 'לא נמצאו תוצאות'}
            </CommandEmpty>

            <CommandGroup heading="ניווט מהיר">
              {QUICK.map(a => (
                <CommandItem key={a.url} value={a.label} onSelect={() => go(a.url)} className="gap-2 cursor-pointer">
                  <a.Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span>{a.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>

            {projects.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="פרויקטים">
                  {projects.map(r => (
                    <CommandItem key={r.id} value={`${r.label} ${r.sub ?? ''}`} onSelect={() => go(r.url)} className="gap-2 cursor-pointer">
                      <r.Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="font-medium">{r.label}</span>
                        {r.sub && <span className="text-muted-foreground text-xs mr-2">{r.sub}</span>}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}

            {apartments.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="דירות">
                  {apartments.map(r => (
                    <CommandItem key={r.id} value={`${r.label} ${r.sub ?? ''}`} onSelect={() => go(r.url)} className="gap-2 cursor-pointer">
                      <r.Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="font-medium">{r.label}</span>
                        {r.sub && <span className="text-muted-foreground text-xs mr-2">{r.sub}</span>}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
          <div className="border-t px-3 py-2 flex gap-3 text-[11px] text-muted-foreground">
            <span><kbd className="font-mono bg-muted px-1 rounded">↵</kbd> לנווט</span>
            <span><kbd className="font-mono bg-muted px-1 rounded">Esc</kbd> לסגור</span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
