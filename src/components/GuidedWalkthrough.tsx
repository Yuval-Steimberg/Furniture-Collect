// =========================================================================
// GuidedWalkthrough — the voice/text-guided, room-by-room inventory flow.
//
// Flow on screen:
//   1. Claude greets + asks which room to start
//   2. Worker speaks (or types) → Whisper transcribes → sends to Claude
//   3. Claude replies with a short Hebrew prompt, quick-reply buttons,
//      and any new items it extracted
//   4. Pending items accumulate in a visible list the worker can eyeball
//   5. When state="done", we batch-insert everything and close the modal
//
// The component is self-contained — parent only needs to pass the
// apartment id + project id and a callback when the walkthrough closes.
// =========================================================================
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Mic, Send, Sparkles, X, Loader2, Check, Package, MapPin } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface Msg { role: 'user' | 'assistant'; content: string }
interface PendingItem {
  description: string;
  quantity: number;
  location: string;
  intended_for_collection: boolean;
  item_type: string;
  material_category: string;
  estimated_weight_kg?: number;
  condition?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  projectId: string;
  apartmentId: string;
  apartmentInfo?: { building_number?: string; apartment_number?: string };
  onInserted?: (ids: string[]) => void;
}

export function GuidedWalkthrough({ open, onClose, projectId, apartmentId, apartmentInfo, onInserted }: Props) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [currentRoom, setCurrentRoom] = useState('');
  const [state, setState] = useState<'asking_room' | 'collecting' | 'transitioning' | 'done'>('asking_room');
  const [quickReplies, setQuickReplies] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [processingAudio, setProcessingAudio] = useState(false);
  const [saving, setSaving] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Kick off the conversation when drawer opens — use a hardcoded greeting
  // so the sheet is interactive instantly instead of waiting for a cold Edge Function start.
  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{
        role: 'assistant',
        content: 'שלום! מוכן לסרוק את הדירה יחד.\nבאיזה חדר נתחיל?',
      }]);
      setQuickReplies(['סלון', 'חדר שינה', 'מטבח', 'חדר עבודה', 'חדר ילדים', 'חדר רחצה', 'מרפסת', 'אחסון']);
    }
    if (!open) {
      // Reset on close so next open starts fresh
      setMessages([]);
      setPending([]);
      setCurrentRoom('');
      setState('asking_room');
      setQuickReplies([]);
      setInput('');
      setRecording(false);
      setProcessingAudio(false);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, pending, loading]);

  const sendToAssistant = async (historyMessages: Msg[], userText: string) => {
    setLoading(true);
    setQuickReplies([]);
    try {
      const outgoing: Msg[] = [...historyMessages, { role: 'user', content: userText }];
      setMessages(m => [...m, { role: 'user', content: userText }]);

      const { data, error } = await supabase.functions.invoke('guided-walkthrough', {
        body: {
          messages: outgoing,
          context: {
            apartment: apartmentInfo,
            items_so_far: pending,
          },
        },
      });
      if (error) throw error;
      const reply = String((data as any)?.reply ?? '');
      const nextState = (data as any)?.state ?? 'collecting';
      const room = String((data as any)?.current_room ?? '');
      const items = Array.isArray((data as any)?.new_items) ? (data as any).new_items : [];
      const quicks = Array.isArray((data as any)?.quick_replies) ? (data as any).quick_replies : [];

      setMessages(m => [...m, { role: 'assistant', content: reply }]);
      setState(nextState);
      if (room) setCurrentRoom(room);
      if (items.length > 0) setPending(p => [...p, ...items]);
      setQuickReplies(quicks);

      if (nextState === 'done' && (items.length > 0 || pending.length > 0)) {
        // Offer auto-save
      }
    } catch (err: any) {
      console.error('guided-walkthrough failed:', err);
      toast.error('שגיאה בעוזר הסריקה');
    } finally {
      setLoading(false);
    }
  };

  const handleUserSend = async (text: string) => {
    if (!text.trim() || loading) return;
    const hist = messages.slice();
    setInput('');
    // If only the hardcoded greeting exists (no real turns yet), send without prior
    // history — the Edge Function system prompt sets the context.
    const isFirstTurn = hist.length === 1 && hist[0].role === 'assistant';
    await sendToAssistant(isFirstTurn ? [] : hist, text.trim());
  };

  // Voice capture: record → transcribe (parse-voice-items) → send transcription as user message
  const toggleRecording = async () => {
    if (recording) {
      mediaRecorderRef.current?.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 },
      });
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      mediaRecorderRef.current = mr;
      audioChunksRef.current = [];
      mr.ondataavailable = e => { audioChunksRef.current.push(e.data); };
      mr.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(t => t.stop());
        setProcessingAudio(true);
        try {
          const base64 = await blobToBase64(blob);
          // Reuse parse-voice-items ONLY for transcription; ignore its parsed items.
          const { data, error } = await supabase.functions.invoke('parse-voice-items', {
            body: { audio: base64 },
          });
          if (error) throw error;
          const transcription = String((data as any)?.transcription ?? '').trim();
          if (!transcription) {
            toast.error('לא הצלחתי להבין — נסה שוב');
            return;
          }
          await handleUserSend(transcription);
        } catch (err: any) {
          console.error('transcription failed:', err);
          const isQuota = String(err?.message ?? '').includes('quota');
          toast.error(isQuota ? 'חסר ק\'רדיט ב-OpenAI — השתמש בטקסט במקום' : 'שגיאה בתמלול — נסה שוב או השתמש בטקסט');
        } finally {
          setProcessingAudio(false);
        }
      };
      mr.start();
      setRecording(true);
    } catch (err: any) {
      console.error('mic error:', err);
      toast.error('לא ניתן לגשת למיקרופון — השתמש בטקסט');
    }
  };

  const saveAllPending = async () => {
    if (pending.length === 0) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('no user');
      const rows = pending.map(p => ({
        project_id: projectId,
        apartment_id: apartmentId,
        created_by_user_id: user.id,
        description: p.description,
        quantity: p.quantity ?? 1,
        location: p.location || null,
        intended_for_collection: p.intended_for_collection !== false,
        item_type: p.item_type as any,
        material_category: p.material_category as any,
        estimated_weight_kg: p.estimated_weight_kg ?? null,
        condition: (p.condition ?? null) as any,
        source: 'voice' as any,
      }));
      const { data: inserted, error } = await supabase.from('items').insert(rows as any).select('id');
      if (error) throw error;
      toast.success(`${rows.length} פריטים נשמרו בדירה`);
      onInserted?.((inserted ?? []).map((r: any) => r.id));
      onClose();
    } catch (err: any) {
      console.error('guided save failed:', err);
      toast.error('שגיאה בשמירה');
    } finally {
      setSaving(false);
    }
  };

  const removePending = (idx: number) => {
    setPending(p => p.filter((_, i) => i !== idx));
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-40 bg-foreground/50 backdrop-blur-sm"
      />
      <motion.div
        key="sheet"
        dir="rtl"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 400, damping: 40 }}
        className="fixed inset-x-0 bottom-0 z-50 h-[92vh] sm:h-[88vh] bg-background border-t border-border rounded-t-2xl shadow-2xl flex flex-col"
        role="dialog"
        aria-modal="true"
      >
        {/* Drag handle */}
        <div className="flex items-center justify-center pt-2">
          <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
        </div>

        {/* Header */}
        <header className="flex items-center gap-3 px-4 py-2">
          <div className="h-9 w-9 rounded-lg bg-foreground text-background flex items-center justify-center">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">סריקה מונחית · AI</div>
            <div className="text-sm font-bold">
              {currentRoom ? currentRoom : 'מתחילים…'}
              {pending.length > 0 && <span className="text-muted-foreground font-normal mr-2">· {pending.length} פריטים נאספו</span>}
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-9 w-9">
            <X className="h-4 w-4" />
          </Button>
        </header>

        {/* Conversation */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-muted/40">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}>
              <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'bg-primary text-primary-foreground rounded-tl-sm'
                  : 'bg-card border border-border text-foreground rounded-tr-sm'
              }`}>
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-end">
              <div className="bg-card border border-border px-3 py-2 rounded-2xl text-sm flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> חושב…
              </div>
            </div>
          )}
          {processingAudio && (
            <div className="flex justify-start">
              <div className="bg-primary/10 text-primary px-3 py-2 rounded-2xl text-sm flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> מתמלל…
              </div>
            </div>
          )}
          {pending.length > 0 && (
            <div className="mt-3 rounded-lg bg-accent/30 border border-accent p-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-accent-foreground mb-2 flex items-center gap-1">
                <Package className="h-3 w-3" /> פריטים לשמור ({pending.length})
              </div>
              <div className="space-y-1.5">
                {pending.map((p, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs bg-card rounded px-2 py-1.5">
                    <Check className="h-3.5 w-3.5 text-accent-foreground flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <span className="font-semibold">{p.description}</span>
                      {p.quantity > 1 && <span className="text-muted-foreground"> × {p.quantity}</span>}
                      {p.location && (
                        <span className="text-muted-foreground mr-1 inline-flex items-center gap-0.5">
                          <MapPin className="h-3 w-3" /> {p.location}
                        </span>
                      )}
                    </div>
                    <button onClick={() => removePending(i)} className="text-destructive/70 hover:text-destructive flex-shrink-0" aria-label="הסר">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Quick replies */}
        {quickReplies.length > 0 && !loading && (
          <div className="px-3 pt-2 flex flex-wrap gap-2">
            {quickReplies.map((q, i) => (
              <button
                key={i}
                onClick={() => void handleUserSend(q)}
                className="px-3 py-1.5 rounded-full border border-border bg-card hover:bg-accent/40 text-sm transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Composer */}
        <form
          onSubmit={e => { e.preventDefault(); void handleUserSend(input); }}
          className="flex items-end gap-2 p-3 border-t border-border bg-card"
        >
          <Button
            type="button"
            onClick={toggleRecording}
            disabled={loading || processingAudio}
            variant={recording ? 'destructive' : 'outline'}
            size="icon"
            className="h-10 w-10 flex-shrink-0"
            aria-label={recording ? 'עצור הקלטה' : 'הקלט'}
          >
            <Mic className={`h-4 w-4 ${recording ? 'animate-pulse' : ''}`} />
          </Button>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={recording ? 'מקליט…' : 'ענה לעוזר או הקלט…'}
            rows={1}
            disabled={recording || processingAudio || loading}
            className="flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring min-h-[40px] max-h-24"
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleUserSend(input);
              }
            }}
            dir="rtl"
          />
          <Button type="submit" size="icon" disabled={loading || !input.trim() || recording || processingAudio} className="h-10 w-10 flex-shrink-0">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>

        {/* Done / save bar — shown when Claude says we're done OR when there are pending items to commit */}
        {(state === 'done' || pending.length > 0) && (
          <div className="p-3 border-t border-border bg-accent/20 flex items-center gap-2">
            <div className="flex-1 text-xs text-muted-foreground">
              {state === 'done' ? 'סיימת את הסריקה. לשמור את הפריטים שנאספו?' : 'אפשר לשמור כבר ולסגור.'}
            </div>
            <Button size="sm" variant="outline" onClick={onClose}>ביטול</Button>
            <Button size="sm" onClick={saveAllPending} disabled={saving || pending.length === 0}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : `שמור ${pending.length} פריטים`}
            </Button>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
