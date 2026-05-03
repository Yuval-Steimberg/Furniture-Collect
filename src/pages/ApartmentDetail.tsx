import { useEffect, useState, useRef, type ChangeEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ArrowLeft, Mic, Edit2, Camera, Check, X, Plus, Menu, Trash2, ImagePlus, Sparkles, Scan, Search, Copy, DollarSign, ChevronDown, ChevronUp, MapPin, Package } from 'lucide-react';
import { toast } from 'sonner';
import { useUndoStack } from '@/hooks/use-undo-stack';
import { UndoFlyout } from '@/components/UndoFlyout';
import { Lightbox } from '@/components/Lightbox';
import { EmptyState } from '@/components/EmptyState';
import { SkeletonItemRow } from '@/components/SkeletonCard';
import { SwipeableRow } from '@/components/SwipeableRow';
import { GuidedWalkthrough } from '@/components/GuidedWalkthrough';

// ---------- image helpers (scan flow) ------------------------------------
// Resize to `maxLongSide` and encode as JPEG at `quality`. Keeps payloads
// well under the 10MB edge-function cap and the ~1MB/ request target.
async function compressImageToJpeg(file: File, maxLongSide: number, quality: number): Promise<Blob> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('image decode failed'));
    el.src = dataUrl;
  });
  const scale = Math.min(1, maxLongSide / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas context unavailable');
  ctx.drawImage(img, 0, 0, w, h);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', quality),
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
interface Item {
  id: string;
  description: string;
  quantity: number;
  location: string | null;
  intended_for_collection: boolean;
  collected: boolean;
  item_type: string;
  material_category: string;
  estimated_weight_kg: number | null;
  image_url: string | null;
  condition?: 'as_new' | 'good' | 'needs_repair' | 'scrap_only' | null;
  ai_confidence?: number | null;
  source?: 'voice' | 'text' | 'image' | 'manual' | null;
  estimated_resale_ils?: number | null;
  duplicate_of?: string | null;
  created_by_user_id: string;
  collected_by_user_id: string | null;
  created_by?: {
    name: string;
  };
  collected_by?: {
    name: string;
  };
}
interface ParsedItem {
  description: string;
  quantity: number;
  location: string;
  intended_for_collection: boolean;
  item_type: string;
  material_category: string;
}
export default function ApartmentDetail() {
  const {
    projectId,
    apartmentId
  } = useParams();
  const navigate = useNavigate();
  const [apartmentInfo, setApartmentInfo] = useState<any>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [filter, setFilter] = useState<'all' | 'collection' | 'no_collection' | 'pending'>('all');
  const [loading, setLoading] = useState(true);
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showManualDialog, setShowManualDialog] = useState(false);
  const [manualItem, setManualItem] = useState({
    description: ''
  });
  const [userRole, setUserRole] = useState<string>('');
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const itemPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const roomInputRef = useRef<HTMLInputElement | null>(null);
  const [scanning, setScanning] = useState(false);
  const [roomScanning, setRoomScanning] = useState(false);
  const [photoingItemId, setPhotoingItemId] = useState<string | null>(null);
  const { batch: undoBatch, push: pushUndo, dismiss: dismissUndo } = useUndoStack({ windowMs: 5000 });

  // Smart search + room-sweep + duplicate-warning state
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchIds, setSearchIds] = useState<Set<string> | null>(null);
  const [searchExplanation, setSearchExplanation] = useState<string>('');
  const [roomDetected, setRoomDetected] = useState<any[] | null>(null);
  const [roomSelected, setRoomSelected] = useState<Set<number>>(new Set());
  const [duplicateWarnings, setDuplicateWarnings] = useState<Map<string, { duplicate_of: string; reason: string }>>(new Map());

  // Multi-photo capture mode state
  const [multiPhotoMode, setMultiPhotoMode] = useState(false);
  const [photoCaptureCount, setPhotoCaptureCount] = useState(0);
  const [showContinueCaptureDialog, setShowContinueCaptureDialog] = useState(false);

  // Bulk select + grouping UI
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [showGuided, setShowGuided] = useState(false);
  const [collapsedLocations, setCollapsedLocations] = useState<Set<string>>(new Set());
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  useEffect(() => {
    loadData();
    loadUserRole();
  }, [apartmentId]);
  const loadUserRole = async () => {
    try {
      const {
        data: {
          user
        }
      } = await supabase.auth.getUser();
      if (!user) return;
      const {
        data: userProject
      } = await supabase.from('user_projects').select('project_role').eq('user_id', user.id).eq('project_id', projectId).single();
      setUserRole(userProject?.project_role || '');
    } catch (error) {
      console.error('Error loading user role:', error);
    }
  };
  const loadData = async () => {
    try {
      const {
        data: apartment,
        error: apartmentError
      } = await supabase.from('apartments').select('*, projects(name)').eq('id', apartmentId).single();
      if (apartmentError) throw apartmentError;
      setApartmentInfo(apartment);
      const {
        data: itemsData,
        error: itemsError
      } = await supabase.from('items').select(`
          *,
          created_by:profiles!items_created_by_user_id_fkey(name),
          collected_by:profiles!items_collected_by_user_id_fkey(name)
        `).eq('apartment_id', apartmentId).order('created_at', {
        ascending: false
      });
      if (itemsError) throw itemsError;
      setItems(itemsData || []);
    } catch (error: any) {
      toast.error('שגיאה בטעינת נתונים');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };
  const toggleRecording = async () => {
    if (recording) {
      // Stop recording
      stopRecording();
    } else {
      // Start recording with optimized settings
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            sampleRate: 16000 // Optimized for speech
          }
        });
        
        // Use optimal bitrate for speech
        const options = { mimeType: 'audio/webm;codecs=opus' };
        const mediaRecorder = new MediaRecorder(stream, options);
        
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];
        
        mediaRecorder.ondataavailable = event => {
          audioChunksRef.current.push(event.data);
        };
        
        mediaRecorder.onstop = async () => {
          const audioBlob = new Blob(audioChunksRef.current, {
            type: 'audio/webm'
          });
          await processAudio(audioBlob);
          stream.getTracks().forEach(track => track.stop());
        };
        
        mediaRecorder.start();
        setRecording(true);
      } catch (error: any) {
        console.error('mic error:', error);
        // Diagnose specific mic failures and give actionable Hebrew guidance.
        const name = error?.name ?? '';
        let title = 'לא ניתן לגשת למיקרופון';
        let description = '';
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          description = 'הדפדפן חוסם את המיקרופון. פתח הגדרות האתר (סמל המנעול ליד הכתובת) → הרשה מיקרופון → רענן את הדף.';
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          description = 'לא נמצא מיקרופון במכשיר. ודא שחיבר מיקרופון או השתמש בכפתור ״ידני״ במקום.';
        } else if (name === 'NotReadableError' || name === 'TrackStartError') {
          description = 'אפליקציה אחרת משתמשת במיקרופון. סגור אותה ונסה שוב.';
        } else if (name === 'SecurityError' || !window.isSecureContext) {
          description = 'הדפדפן מחייב חיבור מאובטח (HTTPS) כדי להפעיל את המיקרופון.';
        } else {
          description = 'אפשר להוסיף פריטים עם כפתור "ידני" או "צלם" במקום ההקלטה.';
        }
        toast.error(title, { description, duration: 7000 });
      }
    }
  };
  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };
  const processAudio = async (audioBlob: Blob) => {
    setProcessing(true);
    
    try {
      // Convert to base64 efficiently
      const reader = new FileReader();
      
      reader.onloadend = async () => {
        try {
          const base64Audio = (reader.result as string).split(',')[1];
          
          console.log('Sending audio for processing...');
          const startTime = Date.now();
          
          const { data, error } = await supabase.functions.invoke('parse-voice-items', {
            body: { audio: base64Audio }
          });
          
          if (error) throw error;
          
          const processingTime = Date.now() - startTime;
          console.log(`Processing completed in ${processingTime}ms`);
          
          // Auto-add items immediately without confirmation
          await addParsedItemsDirectly(data.items);
          
        } catch (error: any) {
          toast.error('שגיאה בעיבוד הקלטה');
          console.error(error);
          setProcessing(false);
          setRecording(false);
        }
      };
      
      reader.onerror = () => {
        toast.error('שגיאה בקריאת קובץ אודיו');
        setProcessing(false);
        setRecording(false);
      };
      
      reader.readAsDataURL(audioBlob);
      
    } catch (error: any) {
      toast.error('שגיאה בעיבוד הקלטה');
      console.error(error);
      setProcessing(false);
      setRecording(false);
    }
  };
  const addParsedItemsDirectly = async (itemsToAdd: ParsedItem[]) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not found');
      
      const itemsToInsert = itemsToAdd.map(item => ({
        project_id: projectId,
        apartment_id: apartmentId,
        description: item.description,
        quantity: item.quantity,
        location: item.location || null,
        intended_for_collection: item.intended_for_collection,
        item_type: item.item_type as any,
        material_category: item.material_category as any,
        created_by_user_id: user.id
      }));
      
      const { data: inserted, error } = await supabase
        .from('items')
        .insert(itemsToInsert)
        .select('id');
      if (error) throw error;
      pushUndo((inserted ?? []).map((r: any) => r.id));
      void runDuplicateCheck((inserted ?? []).map((r: any) => r.id));

      // Reload and reset state (the undo flyout replaces the success toast
      // for auto-inserts, so users can undo rather than just being told).
      await loadData();
      setProcessing(false);
      setRecording(false);
      
    } catch (error: any) {
      toast.error('שגיאה בהוספת פריטים');
      console.error(error);
      setProcessing(false);
      setRecording(false);
    }
  };
  const addManualItem = async () => {
    try {
      const {
        data: {
          user
        }
      } = await supabase.auth.getUser();
      if (!user) throw new Error('User not found');
      if (!manualItem.description.trim()) {
        toast.error('נא להזין תיאור');
        return;
      }
      setProcessing(true);

      // Parse the text using AI
      const {
        data,
        error
      } = await supabase.functions.invoke('parse-text-items', {
        body: {
          text: manualItem.description
        }
      });
      if (error) throw error;

      // Insert parsed items
      const itemsToInsert = data.items.map((item: any) => ({
        project_id: projectId,
        apartment_id: apartmentId,
        description: item.description,
        quantity: item.quantity,
        location: item.location || null,
        intended_for_collection: item.intended_for_collection,
        item_type: item.item_type as any,
        material_category: item.material_category as any,
        created_by_user_id: user.id
      }));
      const { data: inserted, error: insertError } = await supabase
        .from('items')
        .insert(itemsToInsert)
        .select('id');
      if (insertError) throw insertError;
      pushUndo((inserted ?? []).map((r: any) => r.id));
      void runDuplicateCheck((inserted ?? []).map((r: any) => r.id));
      setShowManualDialog(false);
      setManualItem({
        description: ''
      });
      loadData();
    } catch (error: any) {
      toast.error('שגיאה בהוספת פריטים');
      console.error(error);
    } finally {
      setProcessing(false);
    }
  };
  // ---- Camera + vision autofill ----------------------------------------
  const openCameraPicker = () => {
    if (scanning || processing || recording) return;
    fileInputRef.current?.click();
  };
  const handleImageCapture = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset the input so the same file can be picked again later.
    if (e.target) e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('יש לבחור קובץ תמונה');
      return;
    }
    setScanning(true);
    try {
      const compressed = await compressImageToJpeg(file, 1024, 0.78);
      const base64 = await blobToBase64(compressed);
      const { data: parseData, error: parseError } = await supabase.functions.invoke('parse-image-item', {
        body: { image_base64: base64, apartment_id: apartmentId },
      });
      if (parseError) throw parseError;
      const parsed = parseData?.item;
      if (!parsed?.description) throw new Error('AI לא זיהה פריט');

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not found');

      // Upload the compressed JPEG to the item-photos bucket.
      const photoUuid = crypto.randomUUID();
      const path = `${projectId}/${apartmentId}/${photoUuid}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('item-photos')
        .upload(path, compressed, {
          contentType: 'image/jpeg',
          upsert: false,
        });
      if (uploadError) throw uploadError;
      const { data: publicUrl } = supabase.storage.from('item-photos').getPublicUrl(path);

      // Insert the item with AI-derived fields + photo URL.
      const { data: insertedRows, error: insertError } = await supabase.from('items').insert({
        project_id: projectId,
        apartment_id: apartmentId,
        description: parsed.description,
        quantity: parsed.quantity ?? 1,
        location: parsed.location || null,
        intended_for_collection: parsed.intended_for_collection !== false,
        item_type: parsed.item_type as any,
        material_category: parsed.material_category as any,
        estimated_weight_kg: parsed.estimated_weight_kg ?? null,
        condition: parsed.condition as any,
        ai_confidence: parsed.ai_confidence ?? null,
        source: 'image' as any,
        image_url: publicUrl.publicUrl,
        created_by_user_id: user.id,
      } as any).select('id');
      if (insertError) throw insertError;
      pushUndo((insertedRows ?? []).map((r: any) => r.id));
      void runDuplicateCheck((insertedRows ?? []).map((r: any) => r.id));

      const lowConf = (parsed.ai_confidence ?? 1) < 0.6;
      if (lowConf) toast.message('פריט נוסף — מומלץ לאמת תיאור');
      await loadData();
      
      // Multi-photo mode: increment count and show continue dialog
      if (multiPhotoMode) {
        setPhotoCaptureCount(prev => prev + 1);
        setShowContinueCaptureDialog(true);
      }
    } catch (err: any) {
      console.error('scan failed:', err);
      toast.error(err?.message ? `שגיאה בסריקה: ${err.message}` : 'שגיאה בסריקה');
    } finally {
      setScanning(false);
    }
  };

  // Start multi-photo capture session
  const startMultiPhotoMode = () => {
    setMultiPhotoMode(true);
    setPhotoCaptureCount(0);
    openCameraPicker();
  };

  // Continue capturing in multi-photo mode
  const continueCapturing = () => {
    setShowContinueCaptureDialog(false);
    openCameraPicker();
  };

  // End multi-photo capture session
  const endMultiPhotoMode = () => {
    const count = photoCaptureCount;
    setMultiPhotoMode(false);
    setPhotoCaptureCount(0);
    setShowContinueCaptureDialog(false);
    if (count > 0) {
      toast.success(`${count} תמונות נוספו בהצלחה`);
    }
  };
  // ---- Room sweep (multi-item vision) ---------------------------------
  const openRoomPicker = () => {
    if (scanning || roomScanning || processing || recording) return;
    roomInputRef.current?.click();
  };
  const handleRoomImage = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file || !file.type.startsWith('image/')) return;
    setRoomScanning(true);
    try {
      const compressed = await compressImageToJpeg(file, 1024, 0.78);
      const base64 = await blobToBase64(compressed);
      const { data, error } = await supabase.functions.invoke('parse-room-image', {
        body: { image_base64: base64, apartment_id: apartmentId },
      });
      if (error) throw error;
      const parsedItems = (data?.items ?? []) as any[];
      if (parsedItems.length === 0) {
        toast.message('לא זוהו פריטים בתמונה — נסה זווית אחרת');
        return;
      }
      setRoomDetected(parsedItems);
      setRoomSelected(new Set(parsedItems.map((_, i) => i))); // all selected by default
    } catch (err: any) {
      console.error('room sweep failed:', err);
      toast.error(err?.message ? `שגיאה בסריקת חדר: ${err.message}` : 'שגיאה בסריקת חדר');
    } finally {
      setRoomScanning(false);
    }
  };
  const confirmRoomItems = async () => {
    if (!roomDetected) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not found');
      const rows = [...roomSelected]
        .map(idx => roomDetected[idx])
        .map(p => ({
          project_id: projectId,
          apartment_id: apartmentId,
          description: p.description,
          quantity: p.quantity ?? 1,
          location: p.location || null,
          intended_for_collection: p.intended_for_collection !== false,
          item_type: p.item_type as any,
          material_category: p.material_category as any,
          estimated_weight_kg: p.estimated_weight_kg ?? null,
          condition: p.condition as any,
          ai_confidence: p.ai_confidence ?? null,
          source: 'image' as any,
          created_by_user_id: user.id,
        }));
      if (rows.length === 0) {
        setRoomDetected(null);
        return;
      }
      const { data: inserted, error } = await supabase.from('items').insert(rows as any).select('id');
      if (error) throw error;
      pushUndo((inserted ?? []).map((r: any) => r.id));
      void runDuplicateCheck((inserted ?? []).map((r: any) => r.id));
      toast.success(`${rows.length} פריטים נוספו מסריקת החדר`);
      setRoomDetected(null);
      setRoomSelected(new Set());
      await loadData();
    } catch (err: any) {
      console.error('room confirm failed:', err);
      toast.error('שגיאה בהוספת פריטי החדר');
    }
  };

  // ---- Smart search -----------------------------------------------------
  const runSmartSearch = async () => {
    const q = searchQuery.trim();
    if (!q) { setSearchIds(null); setSearchExplanation(''); return; }
    setSearching(true);
    try {
      const lean = items.map(i => ({
        id: i.id, description: i.description, quantity: i.quantity, location: i.location,
        item_type: i.item_type, material_category: i.material_category,
        condition: i.condition, intended_for_collection: i.intended_for_collection,
        collected: i.collected, estimated_weight_kg: i.estimated_weight_kg,
        estimated_resale_ils: i.estimated_resale_ils,
      }));
      const { data, error } = await supabase.functions.invoke('smart-search', {
        body: { query: q, items: lean },
      });
      if (error) throw error;
      setSearchIds(new Set((data?.matching_ids ?? []) as string[]));
      setSearchExplanation(String(data?.explanation ?? ''));
    } catch (err: any) {
      console.error('smart search failed:', err);
      toast.error('שגיאה בחיפוש החכם');
    } finally {
      setSearching(false);
    }
  };
  const clearSearch = () => {
    setSearchQuery('');
    setSearchIds(null);
    setSearchExplanation('');
  };

  // ---- Resale value estimate -------------------------------------------
  const estimateResale = async (item: Item) => {
    try {
      const { data, error } = await supabase.functions.invoke('estimate-resale-value', {
        body: {
          description: item.description,
          item_type: item.item_type,
          material_category: item.material_category,
          condition: item.condition,
          quantity: item.quantity,
          estimated_weight_kg: item.estimated_weight_kg,
          image_url: item.image_url,
        },
      });
      if (error) throw error;
      const val = Number(data?.estimated_resale_ils ?? 0);
      await supabase
        .from('items')
        .update({ estimated_resale_ils: val } as any)
        .eq('id', item.id);
      toast.success(`הערכה: ₪${val}${data?.rationale ? ` · ${data.rationale}` : ''}`);
      await loadData();
    } catch (err: any) {
      console.error('resale estimate failed:', err);
      toast.error('שגיאה בהערכת שווי');
    }
  };

  // ---- Duplicate check after insert (best-effort, non-blocking) --------
  const runDuplicateCheck = async (newIds: string[]) => {
    try {
      const candidates = items.filter(i => newIds.includes(i.id));
      const recent = items.filter(i => !newIds.includes(i.id)).slice(0, 20).map(i => ({
        id: i.id, description: i.description, location: i.location,
        item_type: i.item_type, material_category: i.material_category,
      }));
      if (recent.length === 0) return;
      const warnings = new Map<string, { duplicate_of: string; reason: string }>();
      for (const c of candidates) {
        const { data } = await supabase.functions.invoke('check-duplicate-item', {
          body: {
            candidate: {
              description: c.description, location: c.location,
              item_type: c.item_type, material_category: c.material_category,
            },
            recent,
          },
        });
        if (data?.is_duplicate && data?.duplicate_of && data?.confidence >= 0.7) {
          warnings.set(c.id, { duplicate_of: data.duplicate_of, reason: data.reason });
          await supabase.from('items').update({ duplicate_of: data.duplicate_of } as any).eq('id', c.id);
        }
      }
      if (warnings.size > 0) setDuplicateWarnings(prev => new Map([...prev, ...warnings]));
    } catch (err) {
      console.warn('duplicate check skipped:', err);
    }
  };

  // ---- Bulk select ------------------------------------------------------
  const toggleBulk = (id: string) => {
    setBulkSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const exitBulkMode = () => { setBulkMode(false); setBulkSelected(new Set()); };
  const bulkMarkCollected = async (flag: boolean) => {
    if (bulkSelected.size === 0) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('no user');
      const { error } = await supabase
        .from('items')
        .update({
          collected: flag,
          collected_by_user_id: flag ? user.id : null,
        } as any)
        .in('id', [...bulkSelected]);
      if (error) throw error;
      toast.success(flag ? `${bulkSelected.size} פריטים סומנו כנאספו` : `${bulkSelected.size} פריטים בוטלו מאיסוף`);
      await loadData();
      exitBulkMode();
    } catch (err: any) {
      console.error('bulk update failed:', err);
      toast.error('שגיאה בעדכון בכמות');
    }
  };
  const bulkDelete = async () => {
    if (bulkSelected.size === 0) return;
    if (!confirm(`למחוק ${bulkSelected.size} פריטים?`)) return;
    try {
      const { error } = await supabase.from('items').delete().in('id', [...bulkSelected]);
      if (error) throw error;
      toast.success(`${bulkSelected.size} פריטים נמחקו`);
      await loadData();
      exitBulkMode();
    } catch (err: any) {
      console.error('bulk delete failed:', err);
      toast.error('שגיאה במחיקה');
    }
  };
  const toggleLocationCollapsed = (loc: string) => {
    setCollapsedLocations(prev => {
      const next = new Set(prev);
      if (next.has(loc)) next.delete(loc); else next.add(loc);
      return next;
    });
  };
  const selectAllInLocation = (loc: string, itemsInLoc: Item[]) => {
    setBulkMode(true);
    setBulkSelected(prev => {
      const next = new Set(prev);
      itemsInLoc.forEach(i => next.add(i.id));
      return next;
    });
  };

  // Per-item photo attach — triggered by the small Camera icon on each
  // item row. Unlike "צלם" (which creates a NEW item via vision autofill),
  // this just attaches a reference photo to an existing item.
  const openItemPhotoPicker = (itemId: string) => {
    setPhotoingItemId(itemId);
    itemPhotoInputRef.current?.click();
  };
  const attachPhotoToItem = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const itemId = photoingItemId;
    if (e.target) e.target.value = '';
    setPhotoingItemId(null);
    if (!file || !itemId) return;
    if (!file.type.startsWith('image/')) {
      toast.error('יש לבחור קובץ תמונה');
      return;
    }
    try {
      const compressed = await compressImageToJpeg(file, 1600, 0.8);
      const photoUuid = crypto.randomUUID();
      const path = `${projectId}/${apartmentId}/${photoUuid}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('item-photos')
        .upload(path, compressed, { contentType: 'image/jpeg', upsert: false });
      if (uploadError) throw uploadError;
      const { data: publicUrl } = supabase.storage.from('item-photos').getPublicUrl(path);
      const { error: updateError } = await supabase
        .from('items')
        .update({ image_url: publicUrl.publicUrl } as any)
        .eq('id', itemId);
      if (updateError) throw updateError;
      toast.success('תמונה צורפה לפריט');
      await loadData();
    } catch (err: any) {
      console.error('attach photo failed:', err);
      toast.error(err?.message ? `שגיאה בצירוף תמונה: ${err.message}` : 'שגיאה בצירוף תמונה');
    }
  };
  // Undo handler — deletes the ids in the active batch, skipping any
  // items already marked collected (the worker has confirmed those; we
  // never want to silently revert a confirmation).
  const handleUndoBatch = async () => {
    const snapshot = dismissUndo();
    if (!snapshot || snapshot.ids.length === 0) return;
    try {
      const { data: rows } = await supabase
        .from('items')
        .select('id, collected, image_url')
        .in('id', snapshot.ids);
      const safe = (rows ?? []).filter((r: any) => !r.collected).map((r: any) => r.id);
      const skipped = snapshot.ids.length - safe.length;
      if (safe.length === 0) {
        toast.message('לא ניתן לבטל: כל הפריטים כבר סומנו כנאספו');
        return;
      }
      const { error } = await supabase.from('items').delete().in('id', safe);
      if (error) throw error;
      // Best-effort: clean up the orphaned storage objects too.
      const photoPaths = (rows ?? [])
        .filter((r: any) => safe.includes(r.id) && typeof r.image_url === 'string' && r.image_url.includes('/item-photos/'))
        .map((r: any) => r.image_url.split('/item-photos/')[1])
        .filter(Boolean);
      if (photoPaths.length > 0) {
        await supabase.storage.from('item-photos').remove(photoPaths);
      }
      toast.success(
        skipped > 0
          ? `${safe.length} פריטים הוסרו · ${skipped} נשמרו (נאספו)`
          : `${safe.length} פריטים הוסרו`,
      );
      await loadData();
    } catch (err: any) {
      console.error('undo failed:', err);
      toast.error('שגיאה בביטול הפעולה');
    }
  };
  const updateItem = async (itemId: string, updates: Partial<Item>) => {
    try {
      // If marking as collected, add the current user as collected_by
      const updateData: any = {
        ...updates
      };
      if (updates.collected === true && !items.find(i => i.id === itemId)?.collected) {
        const {
          data: {
            user
          }
        } = await supabase.auth.getUser();
        if (user) {
          updateData.collected_by_user_id = user.id;
        }
      } else if (updates.collected === false) {
        updateData.collected_by_user_id = null;
      }
      const {
        error
      } = await supabase.from('items').update(updateData).eq('id', itemId);
      if (error) throw error;

      // Reload data to get updated user info
      await loadData();

      // Check if all items intended for collection are now collected
      const { data: allItems } = await supabase
        .from('items')
        .select('intended_for_collection, collected')
        .eq('apartment_id', apartmentId);

      if (allItems && allItems.length > 0) {
        const itemsForCollection = allItems.filter(i => i.intended_for_collection);
        const allCollected = itemsForCollection.length > 0 && 
                            itemsForCollection.every(i => i.collected);

        if (allCollected && apartmentInfo?.status !== 'COMPLETED') {
          // Update apartment status to COMPLETED
          await supabase
            .from('apartments')
            .update({ status: 'COMPLETED' })
            .eq('id', apartmentId);
          
          // Reload apartment info
          const { data: apartment } = await supabase
            .from('apartments')
            .select('*, projects(name)')
            .eq('id', apartmentId)
            .single();
          
          if (apartment) {
            setApartmentInfo(apartment);
          }
        }
      }

      toast.success('פריט עודכן');
    } catch (error: any) {
      toast.error('שגיאה בעדכון פריט');
      console.error(error);
    }
  };
  const deleteItem = async () => {
    if (!deletingItemId) return;
    try {
      const {
        error
      } = await supabase.from('items').delete().eq('id', deletingItemId);
      if (error) throw error;
      setItems(items.filter(item => item.id !== deletingItemId));
      toast.success('פריט נמחק');
      setShowDeleteDialog(false);
      setDeletingItemId(null);
    } catch (error: any) {
      toast.error('שגיאה במחיקת פריט');
      console.error(error);
    }
  };
  const filteredItems = items.filter(item => {
    if (searchIds && !searchIds.has(item.id)) return false;
    if (filter === 'all') return true;
    if (filter === 'collection') return item.intended_for_collection;
    if (filter === 'no_collection') return !item.intended_for_collection;
    if (filter === 'pending') return item.intended_for_collection && !item.collected;
    return true;
  });

  // Group filtered items by location for the collapsible sectioned list.
  const groupedItems: Array<[string, Item[]]> = (() => {
    const byLoc = new Map<string, Item[]>();
    for (const item of filteredItems) {
      const loc = item.location?.trim() || 'ללא מיקום';
      if (!byLoc.has(loc)) byLoc.set(loc, []);
      byLoc.get(loc)!.push(item);
    }
    // Sort locations so "ללא מיקום" goes last; others alphabetically (Hebrew locale).
    return [...byLoc.entries()].sort((a, b) => {
      if (a[0] === 'ללא מיקום') return 1;
      if (b[0] === 'ללא מיקום') return -1;
      return a[0].localeCompare(b[0], 'he');
    });
  })();

  // Collect all item photos in display order for the lightbox.
  const photoItems = filteredItems.filter(i => !!i.image_url);
  const getStatusBadge = (status: string) => {
    const badges = {
      'NOT_STARTED': <Badge variant="secondary">לא הושלם</Badge>,
      'DOCUMENTING': <Badge className="bg-warning text-warning-foreground">בתיעוד</Badge>,
      'COMPLETED': <Badge className="bg-success text-success-foreground">הושלם</Badge>
    };
    return badges[status as keyof typeof badges];
  };
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">טוען...</div>;
  }
  return <div className="min-h-screen bg-muted pb-24 w-screen overflow-x-hidden" dir="rtl">
      <header className="bg-sidebar text-sidebar-foreground shadow-md sticky top-0 z-10 w-screen">
        <div className="px-3 sm:px-4 py-3 sm:py-4 w-full">
          <div className="flex items-center gap-2 sm:gap-4 w-full">
            <Button variant="ghost" size="icon" onClick={() => navigate(`/projects/${projectId}`)} className="text-sidebar-foreground hover:bg-sidebar-accent h-9 w-9 sm:h-10 sm:w-10 flex-shrink-0">
              <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
            <div className="flex-1 min-w-0">
              <p className="text-xs sm:text-sm text-primary-foreground/80 truncate">{apartmentInfo?.projects?.name}</p>
              <h1 className="text-base sm:text-lg font-bold truncate">
                בניין {apartmentInfo?.building_number} · דירה {apartmentInfo?.apartment_number}
              </h1>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setBulkMode(v => !v)}
                className="text-sidebar-foreground hover:bg-sidebar-accent h-9 w-9"
                title={bulkMode ? 'יציאה ממצב בחירה' : 'מצב בחירה מרובה'}
                aria-label={bulkMode ? 'יציאה ממצב בחירה' : 'מצב בחירה מרובה'}
              >
                <Check className={`h-4 w-4 ${bulkMode ? 'text-primary' : ''}`} />
              </Button>
              {getStatusBadge(apartmentInfo?.status)}
            </div>
          </div>
        </div>
      </header>

      <main className="px-3 sm:px-4 py-4 sm:py-6 w-full">
        {/* Smart search — natural language filter over items */}
        <div className="w-full mb-3">
          <form onSubmit={e => { e.preventDefault(); void runSmartSearch(); }} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute top-1/2 -translate-y-1/2 right-3 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="חיפוש חכם: ‫רהיטי עץ במצב טוב׳, ‘פריטים מעל 30 קילו׳…"
                className="pr-9"
                dir="rtl"
                disabled={searching}
              />
            </div>
            <Button type="submit" size="sm" disabled={searching || !searchQuery.trim()} className="h-10">
              {searching ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" /> : 'חפש'}
            </Button>
            {searchIds && (
              <Button type="button" size="sm" variant="ghost" onClick={clearSearch} className="h-10">
                <X className="h-4 w-4" />
              </Button>
            )}
          </form>
          {searchExplanation && searchIds && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              <Sparkles className="inline h-3 w-3 ml-1" />{searchExplanation} · {searchIds.size} תוצאות
            </p>
          )}
        </div>

        <div className="w-full -mx-3 sm:mx-0 px-3 sm:px-0 mb-4">
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            <Button variant={filter === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('all')} className="h-9 text-xs sm:text-sm whitespace-nowrap flex-shrink-0">
              הכל ({items.length})
            </Button>
            <Button variant={filter === 'pending' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('pending')} className="h-9 text-xs sm:text-sm whitespace-nowrap flex-shrink-0">
              ממתין לאיסוף ({items.filter(i => i.intended_for_collection && !i.collected).length})
            </Button>
            
            <Button variant={filter === 'no_collection' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('no_collection')} className="h-9 text-xs sm:text-sm whitespace-nowrap flex-shrink-0">רק תיעוד ({items.filter(i => !i.intended_for_collection).length})
            </Button>
          </div>
        </div>

        {/* Bulk-action bar — appears when one or more items are selected */}
        {bulkMode && (
          <div className="sticky top-[4rem] sm:top-[4.5rem] z-20 bg-foreground text-background rounded-lg shadow-lg mb-3 p-2.5 sm:p-3 flex items-center gap-2">
            <span className="text-sm font-semibold flex-1 truncate">
              {bulkSelected.size} נבחרו
            </span>
            <Button size="sm" variant="secondary" onClick={() => bulkMarkCollected(true)} disabled={bulkSelected.size === 0} className="h-8 gap-1">
              <Check className="h-3.5 w-3.5" /> נאסף
            </Button>
            <Button size="sm" variant="destructive" onClick={bulkDelete} disabled={bulkSelected.size === 0} className="h-8 gap-1">
              <Trash2 className="h-3.5 w-3.5" /> מחק
            </Button>
            <Button size="sm" variant="ghost" onClick={exitBulkMode} className="h-8 w-8 p-0 text-background hover:bg-background/10">
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        {loading ? (
          <div className="space-y-2 sm:space-y-3">
            <SkeletonItemRow /><SkeletonItemRow /><SkeletonItemRow />
          </div>
        ) : filteredItems.length === 0 ? (
          <Card className="w-full">
            <CardContent className="p-0">
              <EmptyState
                icon={Package}
                title={items.length === 0 ? 'אין פריטים בדירה הזו' : 'אין תוצאות לסינון הנוכחי'}
                description={items.length === 0
                  ? 'התחל לתעד פריטים — הקלט את הקול שלך, צלם תמונה, או הוסף ידנית.'
                  : 'נסה לשנות את הסינון או לבטל את החיפוש.'}
                actionLabel={items.length === 0 ? 'הקלט פריטים' : undefined}
                onAction={items.length === 0 ? toggleRecording : undefined}
                secondaryLabel={items.length === 0 ? 'הוסף ידנית' : undefined}
                onSecondary={items.length === 0 ? () => setShowManualDialog(true) : undefined}
              />
            </CardContent>
          </Card>
        ) : (
        <div className="space-y-4 w-full">
          {groupedItems.map(([loc, locItems]) => {
            const isCollapsed = collapsedLocations.has(loc);
            const allInLocSelected = locItems.every(i => bulkSelected.has(i.id));
            const locKg = locItems.reduce((s, i) => s + ((i.estimated_weight_kg ?? 0) * (i.quantity ?? 1)), 0);
            return (
            <section key={loc}>
              {/* Location header — sticky, tap to collapse, long-press/button to select-all */}
              <div className="sticky top-[3.2rem] sm:top-[3.7rem] z-10 bg-muted/95 backdrop-blur-sm -mx-3 sm:mx-0 px-3 sm:px-0 py-1.5 mb-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleLocationCollapsed(loc)}
                  className="flex items-center gap-1.5 text-sm font-semibold hover:text-primary transition-colors"
                >
                  {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{loc}</span>
                  <span className="text-xs text-muted-foreground font-normal">({locItems.length}{locKg > 0 ? ` · ${Math.round(locKg)} ק"ג` : ''})</span>
                </button>
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={() => {
                    if (allInLocSelected) {
                      const next = new Set(bulkSelected);
                      locItems.forEach(i => next.delete(i.id));
                      setBulkSelected(next);
                      if (next.size === 0) setBulkMode(false);
                    } else {
                      selectAllInLocation(loc, locItems);
                    }
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  {allInLocSelected ? 'בטל בחירה' : 'בחר הכל'}
                </button>
              </div>

              {!isCollapsed && (
                <div className="space-y-2 sm:space-y-3">
                  {locItems.map(item => (
                    <SwipeableRow
                      key={item.id}
                      disabled={bulkMode}
                      collected={item.collected}
                      onDelete={() => { setDeletingItemId(item.id); setShowDeleteDialog(true); }}
                      onToggleCollected={() => updateItem(item.id, { collected: !item.collected })}
                    >
                    <Card
                      className={`w-full transition-all ${bulkSelected.has(item.id) ? 'ring-2 ring-primary bg-primary/5' : ''}`}
                      onClick={bulkMode ? () => toggleBulk(item.id) : undefined}
                      role={bulkMode ? 'button' : undefined}
                    >
                      <CardContent className="p-3 sm:p-4">
                        <div className="flex flex-col gap-2">
                          <div className="flex items-start gap-2 sm:gap-3 w-full">
                            {/* Bulk checkbox */}
                            {bulkMode && (
                              <div className={`flex-shrink-0 h-5 w-5 mt-0.5 rounded border-2 flex items-center justify-center transition-colors ${bulkSelected.has(item.id) ? 'bg-primary border-primary' : 'border-muted-foreground'}`}>
                                {bulkSelected.has(item.id) && <Check className="h-3.5 w-3.5 text-primary-foreground" strokeWidth={3} />}
                              </div>
                            )}
                            {item.image_url && (
                              <button
                                type="button"
                                onClick={e => {
                                  if (bulkMode) return;
                                  e.stopPropagation();
                                  const idx = photoItems.findIndex(p => p.id === item.id);
                                  setLightboxIndex(idx >= 0 ? idx : 0);
                                }}
                                className="flex-shrink-0 block h-14 w-14 sm:h-16 sm:w-16 rounded-md overflow-hidden border border-border bg-muted"
                                aria-label="הצג תמונת פריט"
                              >
                                <img src={item.image_url} alt={item.description} className="h-full w-full object-cover" loading="lazy" />
                              </button>
                            )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <p className="font-semibold text-sm sm:text-base break-words">{item.description}</p>
                        {item.source === 'image' && (
                          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-accent text-accent-foreground">
                            <Sparkles className="h-2.5 w-2.5" /> AI
                          </span>
                        )}
                        {typeof item.ai_confidence === 'number' && item.ai_confidence < 0.6 && (
                          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                            יש לאמת
                          </span>
                        )}
                        {item.duplicate_of && (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-destructive/20 text-destructive"
                            title={duplicateWarnings.get(item.id)?.reason ?? 'זוהה ככפילות'}
                          >
                            <Copy className="h-2.5 w-2.5" /> כפילות
                          </span>
                        )}
                        {typeof item.estimated_resale_ils === 'number' && item.estimated_resale_ils > 0 && (
                          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-secondary text-secondary-foreground">
                            <DollarSign className="h-2.5 w-2.5" /> ₪{item.estimated_resale_ils}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5 sm:gap-2 text-xs sm:text-sm text-muted-foreground">
                        <span className="whitespace-nowrap">כמות: {item.quantity}</span>
                        {item.location && <><span>•</span><span className="break-words">{item.location}</span></>}
                        <span>•</span>
                        <span className="capitalize whitespace-nowrap">{item.material_category}</span>
                        {item.estimated_weight_kg != null && (
                          <><span>•</span><span className="whitespace-nowrap">{item.estimated_weight_kg} ק"ג</span></>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5 sm:gap-2 text-xs text-muted-foreground mt-1">
                        {item.created_by && <span className="break-words">הוסף על ידי: {item.created_by.name}</span>}
                        {item.collected && item.collected_by && <><span>•</span><span className="break-words">נאסף על ידי: {item.collected_by.name}</span></>}
                      </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <Button variant="ghost" size="icon" onClick={() => {
                    setEditingItem(item);
                    setShowEditDialog(true);
                  }} className="h-9 w-9 sm:h-10 sm:w-10">
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (item.image_url) window.open(item.image_url, '_blank', 'noopener');
                          else openItemPhotoPicker(item.id);
                        }}
                        className={`h-9 w-9 sm:h-10 sm:w-10 ${item.image_url ? '' : 'text-muted-foreground'}`}
                        aria-label={item.image_url ? 'הצג תמונה' : 'צרף תמונה'}
                        title={item.image_url ? 'הצג תמונה' : 'צרף תמונה'}
                      >
                        <Camera className={`h-4 w-4 ${item.image_url ? 'text-success' : ''}`} />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => {
                    setDeletingItemId(item.id);
                    setShowDeleteDialog(true);
                  }} className="h-9 w-9 sm:h-10 sm:w-10 text-destructive hover:text-destructive hover:bg-destructive/10">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-4 pt-2 border-t">
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-xs sm:text-sm whitespace-nowrap">לאיסוף:</span>
                      <Switch checked={item.intended_for_collection} onCheckedChange={checked => updateItem(item.id, {
                    intended_for_collection: checked
                  })} disabled={userRole === 'WORKER'} />
                    </div>
                    {item.intended_for_collection && <div className="flex items-center gap-2 flex-1">
                        <span className="text-xs sm:text-sm whitespace-nowrap">נאסף:</span>
                        <Switch checked={item.collected} onCheckedChange={checked => updateItem(item.id, {
                    collected: checked
                  })} />
                      </div>}
                  </div>
                </div>
              </CardContent>
            </Card>
                    </SwipeableRow>
                  ))}
                </div>
              )}
            </section>
          );
          })}
        </div>
        )}
      </main>

      <div className="fixed bottom-0 left-0 right-0 p-3 sm:p-4 bg-background border-t shadow-lg">
        <div className="flex gap-2 w-full">
          <Button onClick={toggleRecording} size="lg" className="flex-1 gap-2 h-12 sm:h-14 text-base sm:text-lg relative" variant={recording ? "destructive" : processing ? "secondary" : "default"} disabled={processing || scanning}>
            {processing ? <>
                <div className="animate-spin rounded-full h-5 w-5 sm:h-6 sm:w-6 border-b-2 border-current"></div>
                <span>מעבד נתונים...</span>
              </> : recording ? <>
                <Mic className="h-5 w-5 sm:h-6 sm:w-6 animate-pulse" />
                <span>עצור הקלטה</span>
              </> : <>
                <Mic className="h-5 w-5 sm:h-6 sm:w-6" />
                <span>הקלט פריטים</span>
              </>}
          </Button>
          <Button
            onClick={openCameraPicker}
            size="lg"
            variant={scanning ? 'secondary' : 'outline'}
            disabled={recording || processing || scanning || roomScanning || multiPhotoMode}
            className="gap-2 h-12 sm:h-14 px-3 sm:px-4"
            aria-label="צלם פריט"
            title="צלם פריט בודד (AI)"
          >
            {scanning && !multiPhotoMode ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 sm:h-6 sm:w-6 border-b-2 border-muted-foreground"></div>
                <span className="hidden sm:inline">מנתח…</span>
              </>
            ) : (
              <>
                <ImagePlus className="h-5 w-5 sm:h-6 sm:w-6" />
                <span className="hidden sm:inline">צלם</span>
              </>
            )}
          </Button>
          <Button
            onClick={startMultiPhotoMode}
            size="lg"
            variant={multiPhotoMode ? 'default' : 'outline'}
            disabled={recording || processing || scanning || roomScanning}
            className="gap-2 h-12 sm:h-14 px-3 sm:px-4 border-primary/40"
            aria-label="צילום רציף — צלם מספר פריטים ברצף"
            title="צילום רציף — צלם מספר פריטים ללא הפסקה"
          >
            {multiPhotoMode && scanning ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 sm:h-6 sm:w-6 border-b-2 border-current"></div>
                <span className="hidden sm:inline">מנתח…</span>
              </>
            ) : (
              <>
                <Camera className="h-5 w-5 sm:h-6 sm:w-6" />
                <span className="hidden sm:inline">רציף</span>
                {multiPhotoMode && photoCaptureCount > 0 && (
                  <span className="text-xs bg-primary-foreground/20 px-1.5 py-0.5 rounded-full">{photoCaptureCount}</span>
                )}
              </>
            )}
          </Button>
          <Button
            onClick={() => setShowGuided(true)}
            size="lg"
            variant="outline"
            disabled={recording || processing || scanning || roomScanning}
            className="gap-2 h-12 sm:h-14 px-3 sm:px-4 border-primary/40"
            aria-label="סריקה מונחית — AI מלווה אותך חדר-אחרי-חדר"
            title="סריקה מונחית חדר-חדר"
          >
            <Sparkles className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            <span className="hidden sm:inline">מונחה</span>
          </Button>
          <Button
            onClick={openRoomPicker}
            size="lg"
            variant={roomScanning ? 'secondary' : 'outline'}
            disabled={recording || processing || scanning || roomScanning}
            className="gap-2 h-12 sm:h-14 px-3 sm:px-4"
            aria-label="סריקת חדר (AI — פריטים מרובים)"
            title="סריקת חדר — צילום אחד, פריטים מרובים"
          >
            {roomScanning ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 sm:h-6 sm:w-6 border-b-2 border-muted-foreground"></div>
                <span className="hidden sm:inline">סורק…</span>
              </>
            ) : (
              <>
                <Scan className="h-5 w-5 sm:h-6 sm:w-6" />
                <span className="hidden sm:inline">חדר</span>
              </>
            )}
          </Button>
          <Button onClick={() => setShowManualDialog(true)} size="lg" className="gap-2 h-12 sm:h-14 w-12 sm:w-auto px-3 sm:px-4" variant="outline" disabled={recording || processing || scanning}>
            <Plus className="h-5 w-5 sm:h-6 sm:w-6" />
            <span className="hidden sm:inline">ידני</span>
          </Button>
        </div>
        {/* Hidden file input — opens the device camera on mobile, file picker on desktop. */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleImageCapture}
        />
        {/* Hidden input for the per-item Camera icon (attach photo to existing item). */}
        <input
          ref={itemPhotoInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={attachPhotoToItem}
        />
        {/* Hidden input for the room sweep (parse-room-image). */}
        <input
          ref={roomInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleRoomImage}
        />
      </div>

      {/* Room sweep — confirmation modal lets the worker uncheck wrong items before inserting */}
      <Dialog open={!!roomDetected} onOpenChange={open => { if (!open) setRoomDetected(null); }}>
        <DialogContent dir="rtl" className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{roomDetected?.length ?? 0} פריטים זוהו בחדר</DialogTitle>
            <DialogDescription>סמן את הפריטים להוספה לדירה — הסר את מי שלא רלוונטי.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {(roomDetected ?? []).map((it, idx) => {
              const isOn = roomSelected.has(idx);
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    const next = new Set(roomSelected);
                    if (next.has(idx)) next.delete(idx); else next.add(idx);
                    setRoomSelected(next);
                  }}
                  className={`w-full text-right p-3 rounded-md border transition-colors ${isOn ? 'bg-accent/40 border-accent' : 'bg-muted border-border opacity-60'}`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`h-5 w-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${isOn ? 'bg-primary border-primary' : 'border-muted-foreground'}`}>
                      {isOn && <Check className="h-3.5 w-3.5 text-primary-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{it.description} {it.quantity > 1 && <span className="text-xs text-muted-foreground">× {it.quantity}</span>}</p>
                      <p className="text-xs text-muted-foreground">
                        {[it.location, it.material_category, it.estimated_weight_kg ? `${it.estimated_weight_kg} ק"ג` : null].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="flex gap-2 justify-end pt-3 border-t">
            <Button variant="outline" onClick={() => setRoomDetected(null)}>ביטול</Button>
            <Button onClick={confirmRoomItems} disabled={roomSelected.size === 0}>
              הוסף {roomSelected.size} פריטים
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Multi-photo continue capture dialog */}
      <Dialog open={showContinueCaptureDialog} onOpenChange={(open) => { if (!open) endMultiPhotoMode(); }}>
        <DialogContent dir="rtl" className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>פריט נוסף בהצלחה</DialogTitle>
            <DialogDescription>
              {photoCaptureCount} תמונות צולמו עד כה. להמשיך לצלם?
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={endMultiPhotoMode}>
              סיום ({photoCaptureCount})
            </Button>
            <Button onClick={continueCapturing} className="gap-2">
              <Camera className="h-4 w-4" />
              צלם עוד
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Gmail-style undo flyout — appears for 5s after every auto-insert batch. */}
      <UndoFlyout
        count={undoBatch ? undoBatch.ids.length : null}
        expiresAt={undoBatch ? undoBatch.expiresAt : null}
        onUndo={handleUndoBatch}
        onDismiss={() => dismissUndo()}
      />

      {/* Voice-guided, room-by-room walkthrough */}
      <GuidedWalkthrough
        open={showGuided}
        onClose={() => setShowGuided(false)}
        projectId={projectId!}
        apartmentId={apartmentId!}
        apartmentInfo={apartmentInfo}
        onInserted={async (ids) => {
          pushUndo(ids);
          await loadData();
        }}
      />

      {/* Full-screen swipable photo gallery */}
      {lightboxIndex != null && photoItems.length > 0 && (
        <Lightbox
          items={photoItems.map(i => ({
            src: i.image_url!,
            alt: i.description,
            caption: `${i.description}${i.location ? ` · ${i.location}` : ''}`,
          }))}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}


      {/* Edit Item Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>עריכת פריט</DialogTitle>
          </DialogHeader>
          {editingItem && <div className="space-y-4">
              <div>
                <Label>תיאור</Label>
                <Input value={editingItem.description} onChange={e => setEditingItem({
              ...editingItem,
              description: e.target.value
            })} />
              </div>
              <div>
                <Label>כמות</Label>
                <Input type="number" value={editingItem.quantity} onChange={e => setEditingItem({
              ...editingItem,
              quantity: parseInt(e.target.value) || 1
            })} />
              </div>
              <div>
                <Label>מיקום</Label>
                <Input value={editingItem.location || ''} onChange={e => setEditingItem({
              ...editingItem,
              location: e.target.value
            })} />
              </div>
              <div>
                <Label>סוג פריט</Label>
                <Select value={editingItem.item_type} onValueChange={value => setEditingItem({
              ...editingItem,
              item_type: value
            })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="furniture">רהיט</SelectItem>
                    <SelectItem value="appliance">מכשיר חשמלי</SelectItem>
                    <SelectItem value="textile">טקסטיל</SelectItem>
                    <SelectItem value="small_item">פריט קטן</SelectItem>
                    <SelectItem value="other">אחר</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>קטגוריית חומר</Label>
                <Select value={editingItem.material_category} onValueChange={value => setEditingItem({
              ...editingItem,
              material_category: value
            })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="glass">זכוכית</SelectItem>
                    <SelectItem value="aluminum">אלומיניום</SelectItem>
                    <SelectItem value="wood">עץ</SelectItem>
                    <SelectItem value="plastic">פלסטיק</SelectItem>
                    <SelectItem value="metal">מתכת</SelectItem>
                    <SelectItem value="textile">טקסטיל</SelectItem>
                    <SelectItem value="electrical">חשמלי</SelectItem>
                    <SelectItem value="other">אחר</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={() => {
            updateItem(editingItem.id, {
              description: editingItem.description,
              quantity: editingItem.quantity,
              location: editingItem.location,
              item_type: editingItem.item_type,
              material_category: editingItem.material_category
            });
            setShowEditDialog(false);
          }} className="w-full">
                שמור שינויים
              </Button>
              {/* AI resale estimate — fetches a Claude-generated ILS estimate */}
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  if (!editingItem) return;
                  await estimateResale(editingItem);
                  setShowEditDialog(false);
                }}
                className="w-full gap-2"
                title="הערכת שווי יד-שנייה באמצעות AI"
              >
                <DollarSign className="h-4 w-4" />
                הערכת שווי (AI)
                {typeof editingItem.estimated_resale_ils === 'number' && editingItem.estimated_resale_ils > 0 && (
                  <span className="text-xs text-muted-foreground">· נוכחי: ₪{editingItem.estimated_resale_ils}</span>
                )}
              </Button>
            </div>}
        </DialogContent>
      </Dialog>

      {/* Manual Entry Dialog */}
      <Dialog open={showManualDialog} onOpenChange={setShowManualDialog}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>הוספת פריטים ידנית</DialogTitle>
            <DialogDescription>
              כתוב את הפריטים בחופשיות והמערכת תזהה אותם
            </DialogDescription>
          </DialogHeader>
          
          {processing ? <div className="py-8 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
              <p className="mt-4 text-sm text-muted-foreground">מעבד את הטקסט...</p>
            </div> : <div className="space-y-4">
              <div>
                <Label>תיאור הפריטים *</Label>
                <textarea value={manualItem.description} onChange={e => setManualItem({
              description: e.target.value
            })} placeholder="לדוגמה: 2 שולחנות 3 כסאות שטיח בסלון מקרר לא לקחת" className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm" dir="rtl" />
                <p className="text-xs text-muted-foreground mt-1">
                  המערכת תזהה אוטומטית כמויות, מיקומים וקטגוריות
                </p>
              </div>

              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowManualDialog(false)} disabled={processing}>
                  ביטול
                </Button>
                <Button onClick={addManualItem} disabled={processing || !manualItem.description.trim()}>
                  הוסף פריטים
                </Button>
              </div>
            </div>}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>מחיקת פריט</DialogTitle>
            <DialogDescription>
              האם אתה בטוח שברצונך למחוק פריט זה? פעולה זו אינה ניתנת לביטול.
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => {
            setShowDeleteDialog(false);
            setDeletingItemId(null);
          }}>
              ביטול
            </Button>
            <Button variant="destructive" onClick={deleteItem}>
              מחק פריט
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>;
}