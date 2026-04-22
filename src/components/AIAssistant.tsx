// =========================================================================
// AIAssistant — floating AI chat drawer, available anywhere in the app.
//
// Tap the floating sparkle button → drawer slides in from the left (RTL).
// Claude gets a live snapshot of the caller's data every request, so
// answers are grounded in real projects/apartments/items.
//
// Also supports a few "quick start" prompts on first open that seed the
// conversation with useful tasks: summarize this apartment, draft a
// WhatsApp to the developer, generate a Yad2 listing, rank items for
// pickup, etc.
// =========================================================================
import { useEffect, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Sparkles, X, Send, MessageSquare, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface ChatMsg { role: 'user' | 'assistant'; content: string; t: number }

interface ContextSnapshot {
  current_page: string;
  project?: any;
  apartment?: any;
  items_in_scope?: any[];
  all_projects?: any[];
  all_apartments_count?: number;
  all_items_count?: number;
  user?: { id: string; name: string; org_role: string };
}

const QUICK_PROMPTS: Array<{ label: string; text: string; icon: string }> = [
  { icon: '📝', label: 'סיכום לדירה', text: 'נסח לי סיכום מקצועי בעברית של הדירה הזו — משקל כולל, חומרים עיקריים, הערכה של המצב הכללי.' },
  { icon: '💰', label: 'מודעת Yad2', text: 'הצע לי מודעות Yad2 מוכנות עבור 3 הפריטים הכי שווים למכירה בדירה הזו. לכל אחד: כותרת, תיאור, מחיר מוצע.' },
  { icon: '🚚', label: 'סדר איסוף חכם', text: 'סדר לי את הפריטים לאיסוף לפי סדר חכם — שקלול של שווי מכירה, משקל ולוגיסטיקה. הסבר קצר למה לקחת כל אחד.' },
  { icon: '✉️', label: 'WhatsApp ליזם', text: 'נסח לי הודעת WhatsApp קצרה ליזם שמעדכנת אותו על ההתקדמות בפרויקט — כמה דירות הושלמו, כמה טון הוצלו, וכמה CO2 נחסך.' },
  { icon: '🔍', label: 'מה חסר?', text: 'לפי מה שתיעדנו עד עכשיו, האם יש פריטים טיפוסיים שאולי פיספסנו לתעד בדירה הזו? (לדוגמה רהיטים נפוצים שבדרך כלל מופיעים יחד)' },
];

export function AIAssistant() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const location = useLocation();
  const params = useParams();

  // Auto-scroll to latest message
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  const buildContext = async (): Promise<ContextSnapshot> => {
    const { data: { user } } = await supabase.auth.getUser();
    const ctx: ContextSnapshot = {
      current_page: location.pathname,
    };
    if (user) {
      const { data: profile } = await supabase.from('profiles').select('id,name,org_role').eq('id', user.id).single();
      if (profile) ctx.user = profile as any;
    }
    const projectId = (params.projectId as string) ?? null;
    const apartmentId = (params.apartmentId as string) ?? null;

    // Scope the data we attach to what's relevant — keep the payload slim.
    if (apartmentId) {
      const { data: apt } = await supabase.from('apartments').select('*, projects(id,name,city,developer_name)').eq('id', apartmentId).single();
      ctx.apartment = apt;
      ctx.project = (apt as any)?.projects;
      const { data: items } = await supabase.from('items').select('id,description,quantity,location,intended_for_collection,collected,item_type,material_category,estimated_weight_kg,condition,estimated_resale_ils,source,ai_confidence').eq('apartment_id', apartmentId);
      ctx.items_in_scope = items ?? [];
    } else if (projectId) {
      const { data: project } = await supabase.from('projects').select('*').eq('id', projectId).single();
      ctx.project = project;
      const { data: apts } = await supabase.from('apartments').select('id,building_number,apartment_number,status').eq('project_id', projectId);
      ctx.apartment = undefined;
      (ctx as any).apartments_in_project = apts ?? [];
      const { data: items } = await supabase.from('items').select('id,description,location,item_type,material_category,estimated_weight_kg,collected,intended_for_collection,estimated_resale_ils').eq('project_id', projectId);
      ctx.items_in_scope = items ?? [];
    } else {
      const [{ data: projects }, { data: apts }, { data: items }] = await Promise.all([
        supabase.from('projects').select('id,name,city,developer_name'),
        supabase.from('apartments').select('id'),
        supabase.from('items').select('id,collected,intended_for_collection,estimated_weight_kg,material_category'),
      ]);
      ctx.all_projects = projects ?? [];
      ctx.all_apartments_count = apts?.length ?? 0;
      ctx.all_items_count = items?.length ?? 0;
    }
    return ctx;
  };

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: ChatMsg = { role: 'user', content: text.trim(), t: Date.now() };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput('');
    setLoading(true);
    try {
      const context = await buildContext();
      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: {
          context,
          messages: nextMessages.map(m => ({ role: m.role, content: m.content })),
        },
      });
      if (error) throw error;
      const reply = (data as any)?.reply ?? '';
      setMessages([...nextMessages, { role: 'assistant', content: reply, t: Date.now() }]);
    } catch (err: any) {
      console.error('assistant failed:', err);
      toast.error('שגיאה בעוזר ה-AI');
      setMessages([...nextMessages, { role: 'assistant', content: '_שגיאה בקריאה לעוזר. נסה שוב._', t: Date.now() }]);
    } finally {
      setLoading(false);
    }
  };

  // Don't render on auth page
  if (location.pathname.startsWith('/auth') || location.pathname.startsWith('/accept-invitation')) {
    return null;
  }

  return (
    <>
      {/* Floating action button */}
      <AnimatePresence>
        {!open && (
          <motion.button
            key="fab"
            initial={{ opacity: 0, scale: 0.6, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.6, y: 10 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            onClick={() => setOpen(true)}
            className="fixed bottom-[5.5rem] sm:bottom-6 left-4 sm:left-6 z-30 h-12 w-12 sm:h-14 sm:w-14 rounded-full bg-foreground text-background shadow-lg hover:shadow-xl flex items-center justify-center group active:scale-95 transition-all"
            aria-label="פתח עוזר AI"
            title="עוזר AI (Cmd+K)"
          >
            <Sparkles className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={1.75} />
            <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-primary animate-pulse" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Drawer */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 bg-foreground/30 backdrop-blur-sm"
            />
            <motion.aside
              key="drawer"
              dir="rtl"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 400, damping: 40 }}
              className="fixed inset-y-0 left-0 z-50 w-full sm:w-[440px] bg-background border-l border-border shadow-2xl flex flex-col"
              role="dialog"
              aria-modal="true"
            >
              {/* Header */}
              <header className="flex items-center gap-3 px-4 py-3 border-b border-border bg-sidebar text-sidebar-foreground">
                <div className="h-9 w-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
                  <Sparkles className="h-5 w-5" strokeWidth={1.75} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs uppercase tracking-wider text-sidebar-foreground/70">עוזר AI</div>
                  <div className="text-sm font-semibold">שואל אותי כל דבר על הנתונים שלך</div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setOpen(false)} className="text-sidebar-foreground hover:bg-sidebar-accent h-9 w-9">
                  <X className="h-4 w-4" />
                </Button>
              </header>

              {/* Messages */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 sm:px-4 py-4 space-y-3">
                {messages.length === 0 && (
                  <div className="space-y-3">
                    <div className="rounded-lg bg-accent/40 p-3 text-sm leading-relaxed">
                      שלום. אני חבר לנתונים של <strong>Just A Second</strong>. אני יודע מה בכל הפרויקטים שלך,
                      כמה טון הוצלו, ומה הסטטוס של כל דירה. תשאל אותי מה שתרצה, או התחל עם אחת מההצעות:
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                      {QUICK_PROMPTS.map((p, i) => (
                        <button
                          key={i}
                          onClick={() => void send(p.text)}
                          className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card hover:bg-accent/30 hover:border-accent transition-colors text-right"
                        >
                          <span className="text-xl flex-shrink-0">{p.icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-sm">{p.label}</div>
                            <div className="text-xs text-muted-foreground line-clamp-2">{p.text}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                    <div
                      className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words ${
                        m.role === 'user'
                          ? 'bg-primary text-primary-foreground rounded-tl-sm'
                          : 'bg-muted text-foreground rounded-tr-sm'
                      }`}
                    >
                      {m.content}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-end">
                    <div className="bg-muted text-muted-foreground px-3 py-2 rounded-2xl text-sm flex items-center gap-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>חושב…</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Composer */}
              <form
                onSubmit={e => { e.preventDefault(); void send(input); }}
                className="flex items-end gap-2 p-3 border-t border-border bg-card"
              >
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder="שאל, בקש סיכום, נסח הודעה…"
                  className="flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring min-h-[40px] max-h-32"
                  rows={1}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void send(input);
                    }
                  }}
                  dir="rtl"
                  disabled={loading}
                />
                <Button type="submit" size="icon" disabled={loading || !input.trim()} className="h-10 w-10 flex-shrink-0">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </form>
              {messages.length > 0 && (
                <div className="px-3 py-2 text-center text-xs text-muted-foreground border-t border-border">
                  <button
                    onClick={() => { if (confirm('לנקות את השיחה?')) setMessages([]); }}
                    className="hover:text-foreground inline-flex items-center gap-1"
                  >
                    <MessageSquare className="h-3 w-3" /> שיחה חדשה
                  </button>
                </div>
              )}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
