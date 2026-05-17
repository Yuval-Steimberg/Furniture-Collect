import { useEffect, useState, useRef, type ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { addRecording, addImage } from '@/lib/offlineQueue';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ArrowLeft, Mic, Edit2, Camera, Check, X, Plus, Menu, Trash2, ImagePlus, Sparkles, Scan, Search, Copy, DollarSign, ChevronDown, ChevronUp, MapPin, Package, Ban, User, Images, Repeat2, List, LayoutGrid, Pen, HelpCircle } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { CameraCapture } from '@/components/CameraCapture';
import { toast } from 'sonner';
import { useUndoStack } from '@/hooks/use-undo-stack';
import { UndoFlyout } from '@/components/UndoFlyout';
import { PageHeader } from '@/components/PageHeader';
import { Lightbox } from '@/components/Lightbox';
import { EmptyState } from '@/components/EmptyState';
import { SkeletonItemRow } from '@/components/SkeletonCard';
import { SwipeableRow } from '@/components/SwipeableRow';
import { GuidedWalkthrough } from '@/components/GuidedWalkthrough';
import { PhotoAnnotation } from '@/components/PhotoAnnotation';
import { ITEM_CATEGORIES } from '@/lib/itemCategories';
import { logAudit } from '@/lib/auditLog';
import { fireWebhooks } from '@/components/WebhookManager';

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
  photo_urls?: string[] | null;
  status?: string | null;
  collected_by?: string | null;
  condition?: 'as_new' | 'good' | 'needs_repair' | 'scrap_only' | null;
  ai_confidence?: number | null;
  source?: 'voice' | 'text' | 'image' | 'manual' | null;
  item_category?: string | null;
  estimated_resale_ils?: number | null;
  duplicate_of?: string | null;
  created_by_user_id: string;
  collected_by_user_id: string | null;
  created_by?: { name: string; };
  collector_profile?: { name: string; };
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
  const [currentUserName, setCurrentUserName] = useState<string>('');
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const itemPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const roomInputRef = useRef<HTMLInputElement | null>(null);
  const multiUploadInputRef = useRef<HTMLInputElement | null>(null);
  const continueInputRef = useRef<HTMLInputElement | null>(null);
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

  // Collection attribution — "נאסף על ידי מי?"
  const [showAttributionDialog, setShowAttributionDialog] = useState(false);
  const [pendingCollectionItemId, setPendingCollectionItemId] = useState<string | null>(null);
  const [collectorInput, setCollectorInput] = useState('');
  const [isReattribution, setIsReattribution] = useState(false);

  // Bulk collect attribution
  const [showBulkCollectDialog, setShowBulkCollectDialog] = useState(false);
  const [showModeHelp, setShowModeHelp] = useState(false);
  const [bulkCollectorInput, setBulkCollectorInput] = useState('');

  // Multi-photo gallery upload (creates new items)
  const [multiUploading, setMultiUploading] = useState(false);
  const [multiUploadProgress, setMultiUploadProgress] = useState<{ current: number; total: number } | null>(null);

  // Gallery/list view toggle + building siblings for navigation
  const [viewMode, setViewMode] = useState<'list' | 'gallery'>('list');
  const [buildingApts, setBuildingApts] = useState<Array<{id: string, apartment_number: string}>>([]);

  // In-app camera overlay (desktop; mobile uses OS camera via file input)
  const [showCamera, setShowCamera] = useState(false);
  const isMobile = useIsMobile();

  // Photo annotation overlay
  const [annotatingItem, setAnnotatingItem] = useState<Item | null>(null);

  useEffect(() => {
    loadData();
    loadUserRole();
  }, [apartmentId]);

  // Realtime subscription — reload items on any change in this apartment
  useEffect(() => {
    if (!apartmentId) return;
    const channel = supabase
      .channel(`items-rt-${apartmentId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items', filter: `apartment_id=eq.${apartmentId}` },
        () => { void loadData(); }
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
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
      // Load display name for auto-fill in collection attribution
      const { data: profile } = await supabase.from('profiles').select('name').eq('id', user.id).single();
      if (profile?.name) setCurrentUserName(profile.name);
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
      // Load sibling apartments for prev/next navigation
      const { data: siblings } = await supabase
        .from('apartments')
        .select('id,apartment_number')
        .eq('project_id', projectId!)
        .eq('building_number', apartment.building_number)
        .order('apartment_number');
      setBuildingApts(siblings ?? []);
      let { data: itemsData, error: itemsError } = await supabase.from('items').select(`
          *,
          created_by:profiles!items_created_by_user_id_fkey(name),
          collector_profile:profiles!items_collected_by_user_id_fkey(name)
        `).eq('apartment_id', apartmentId)
        .order('collection_order', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true });
      if (itemsError) {
        // collection_order column may not exist yet — fall back to created_at
        const fallback = await supabase.from('items').select(`
            *,
            created_by:profiles!items_created_by_user_id_fkey(name),
            collector_profile:profiles!items_collected_by_user_id_fkey(name)
          `).eq('apartment_id', apartmentId)
          .order('created_at', { ascending: true });
        if (fallback.error) throw fallback.error;
        itemsData = fallback.data;
      }
      setItems(itemsData || []);
    } catch (error: any) {
      toast.error('שגיאה בטעינת נתונים');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };
  const handleAnnotationSave = async (blob: Blob, item: Item) => {
    try {
      const photoUuid = crypto.randomUUID();
      const path = `${projectId}/${apartmentId}/${photoUuid}-annotated.jpg`;
      const { error: uploadError } = await supabase.storage.from('item-photos').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
      if (uploadError) throw uploadError;
      const { data: publicData } = supabase.storage.from('item-photos').getPublicUrl(path);
      const newUrl = publicData.publicUrl;
      const existingUrls: string[] = item.photo_urls?.length ? item.photo_urls : item.image_url ? [item.image_url] : [];
      const allUrls = [newUrl, ...existingUrls];
      await supabase.from('items').update({ photo_urls: allUrls, image_url: newUrl } as any).eq('id', item.id);
      toast.success('הערה נשמרה על התמונה');
      await loadData();
    } catch (err: any) {
      toast.error('שגיאה בשמירת ההערה');
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

    if (!navigator.onLine) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await addRecording({
          id: crypto.randomUUID(),
          apartment_id: apartmentId!,
          project_id: projectId!,
          user_id: user.id,
          audio_blob: audioBlob,
          recorded_at: Date.now(),
        });
      }
      toast.info('אין חיבור לרשת — ההקלטה נשמרה ותסונכרן בחזרה לרשת');
      setProcessing(false);
      return;
    }

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
        item_category: (item as any).item_category || null,
        created_by_user_id: user.id
      }));
      
      const { data: inserted, error } = await supabase
        .from('items')
        .insert(itemsToInsert)
        .select('id');
      if (error) throw error;
      pushUndo((inserted ?? []).map((r: any) => r.id));
      void runDuplicateCheck((inserted ?? []).map((r: any) => r.id));
      void logAudit({
        action: 'item_created',
        entity_type: 'item',
        entity_id: (inserted?.[0] as any)?.id ?? '',
        entity_label: `${itemsToInsert.length} פריטים מהקלטה`,
        project_id: projectId ?? null,
        apartment_id: apartmentId ?? null,
        actor_name: 'Worker',
      });

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
        item_category: item.item_category || null,
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
    if (!isMobile && navigator.mediaDevices?.getUserMedia) {
      setShowCamera(true);
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleCameraCapture = async (file: File) => {
    setScanning(true);

    if (!navigator.onLine) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await addImage({
          id: crypto.randomUUID(),
          apartment_id: apartmentId!,
          project_id: projectId!,
          user_id: user.id,
          image_blob: file,
          captured_at: Date.now(),
        });
      }
      toast.info('אין חיבור לרשת — התמונה נשמרה ותסונכרן בחזרה לרשת');
      setScanning(false);
      return;
    }

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
      const photoUuid = crypto.randomUUID();
      const path = `${projectId}/${apartmentId}/${photoUuid}.jpg`;
      const { error: uploadError } = await supabase.storage.from('item-photos').upload(path, compressed, { contentType: 'image/jpeg', upsert: false });
      if (uploadError) throw uploadError;
      const { data: publicData } = supabase.storage.from('item-photos').getPublicUrl(path);
      const payload: any = {
        apartment_id: apartmentId, project_id: projectId,
        description: parsed.description, quantity: parsed.quantity ?? 1,
        location: parsed.location ?? null,
        intended_for_collection: parsed.intended_for_collection ?? true,
        item_type: parsed.item_type ?? 'furniture',
        material_category: parsed.material_category ?? 'other',
        item_category: parsed.item_category ?? null,
        estimated_weight_kg: parsed.estimated_weight_kg ?? null,
        ai_confidence: parsed.confidence ?? null,
        image_url: publicData.publicUrl, photo_urls: [publicData.publicUrl],
        source: 'image', created_by_user_id: user.id,
      };
      const { data: inserted, error: insertError } = await supabase.from('items').insert(payload).select('id');
      if (insertError) throw insertError;
      pushUndo((inserted ?? []).map((r: any) => r.id));
      toast.success(`${parsed.description} זוהה ונוסף`);
      await loadData();
    } catch (err: any) {
      toast.error(err?.message ?? 'שגיאה בסריקת התמונה');
    } finally {
      setScanning(false);
    }
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

    if (!navigator.onLine) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await addImage({
          id: crypto.randomUUID(),
          apartment_id: apartmentId!,
          project_id: projectId!,
          user_id: user.id,
          image_blob: file,
          captured_at: Date.now(),
        });
      }
      toast.info('אין חיבור לרשת — התמונה נשמרה ותסונכרן בחזרה לרשת');
      setScanning(false);
      return;
    }

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

  // Continue capturing — triggered by the label/input inside the dialog (trusted event)
  const handleContinueCapture = (e: ChangeEvent<HTMLInputElement>) => {
    setShowContinueCaptureDialog(false);
    handleImageCapture(e);
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

  // ---- Multi-gallery upload (select many photos → each creates a new item via AI) ----
  const openMultiUploadPicker = () => {
    if (scanning || processing || recording || multiUploading || roomScanning) return;
    multiUploadInputRef.current?.click();
  };

  const handleMultiUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/'));
    if (e.target) e.target.value = '';
    if (files.length === 0) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setMultiUploading(true);
    setMultiUploadProgress({ current: 0, total: files.length });
    const newIds: string[] = [];
    let successCount = 0;

    for (let i = 0; i < files.length; i++) {
      setMultiUploadProgress({ current: i + 1, total: files.length });
      try {
        const compressed = await compressImageToJpeg(files[i], 1024, 0.78);
        const base64 = await blobToBase64(compressed);
        const { data: parseData, error: parseError } = await supabase.functions.invoke('parse-image-item', {
          body: { image_base64: base64, apartment_id: apartmentId },
        });
        if (parseError) throw parseError;
        const parsed = parseData?.item;
        if (!parsed?.description) throw new Error('AI לא זיהה פריט');

        const photoUuid = crypto.randomUUID();
        const path = `${projectId}/${apartmentId}/${photoUuid}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from('item-photos')
          .upload(path, compressed, { contentType: 'image/jpeg', upsert: false });
        if (uploadError) throw uploadError;
        const { data: publicUrl } = supabase.storage.from('item-photos').getPublicUrl(path);

        const { data: insertedRows, error: insertError } = await supabase.from('items').insert({
          project_id: projectId,
          apartment_id: apartmentId,
          description: parsed.description,
          quantity: parsed.quantity ?? 1,
          location: parsed.location || null,
          intended_for_collection: parsed.intended_for_collection !== false,
          item_type: parsed.item_type as any,
          material_category: parsed.material_category as any,
          item_category: parsed.item_category ?? null,
          estimated_weight_kg: parsed.estimated_weight_kg ?? null,
          condition: parsed.condition as any,
          ai_confidence: parsed.ai_confidence ?? null,
          source: 'image' as any,
          image_url: publicUrl.publicUrl,
          created_by_user_id: user.id,
        } as any).select('id');
        if (insertError) throw insertError;
        (insertedRows ?? []).forEach((r: any) => newIds.push(r.id));
        successCount++;
      } catch (err: any) {
        console.error(`multi-upload image ${i + 1} failed:`, err);
        toast.error(`שגיאה בתמונה ${i + 1}: ${err?.message ?? 'שגיאה'}`);
      }
    }

    setMultiUploading(false);
    setMultiUploadProgress(null);

    if (newIds.length > 0) {
      pushUndo(newIds);
      void runDuplicateCheck(newIds);
      await loadData();
    }
    if (successCount > 0) {
      toast.success(`${successCount} פריטים נוספו מ-${files.length} תמונות`);
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
          item_category: (p as any).item_category ?? null,
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

  const bulkMarkCollected = async (flag: boolean, collectorName?: string) => {
    if (bulkSelected.size === 0) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('no user');
      const updatePayload: any = {
        collected: flag,
        collected_by_user_id: flag ? user.id : null,
        status: flag ? 'collected' : 'pending',
        collected_by: flag ? (collectorName || null) : null,
      };
      let { error } = await supabase.from('items').update(updatePayload).in('id', [...bulkSelected]);
      if (error) {
        // Fallback without optional columns
        const core = { collected: flag, collected_by_user_id: flag ? user.id : null };
        const retry = await supabase.from('items').update(core).in('id', [...bulkSelected]);
        if (retry.error) throw retry.error;
      }
      if (flag && collectorName) localStorage.setItem('fc_last_collector', collectorName);
      toast.success(flag ? `${bulkSelected.size} פריטים סומנו כנאספו` : `${bulkSelected.size} פריטים בוטלו מאיסוף`);
      await loadData();
      exitBulkMode();
    } catch (err: any) {
      console.error('bulk update failed:', err);
      toast.error('שגיאה בעדכון בכמות');
    }
  };

  const startBulkCollect = () => {
    setBulkCollectorInput(localStorage.getItem('fc_last_collector') || '');
    setShowBulkCollectDialog(true);
  };

  const confirmBulkCollect = async () => {
    setShowBulkCollectDialog(false);
    const name = bulkCollectorInput.trim();
    await bulkMarkCollected(true, name || undefined);
    setBulkCollectorInput('');
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
    const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/'));
    const itemId = photoingItemId;
    if (e.target) e.target.value = '';
    setPhotoingItemId(null);
    if (files.length === 0 || !itemId) return;
    try {
      const currentItem = items.find(i => i.id === itemId);
      const existingUrls: string[] = currentItem?.photo_urls?.length
        ? currentItem.photo_urls
        : currentItem?.image_url ? [currentItem.image_url] : [];

      const uploadedUrls: string[] = [];
      for (const file of files) {
        const compressed = await compressImageToJpeg(file, 1600, 0.8);
        const photoUuid = crypto.randomUUID();
        const path = `${projectId}/${apartmentId}/${photoUuid}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from('item-photos')
          .upload(path, compressed, { contentType: 'image/jpeg', upsert: false });
        if (uploadError) throw uploadError;
        const { data: publicUrl } = supabase.storage.from('item-photos').getPublicUrl(path);
        uploadedUrls.push(publicUrl.publicUrl);
      }

      const allUrls = [...existingUrls, ...uploadedUrls];
      const { error: updateError } = await supabase
        .from('items')
        .update({ photo_urls: allUrls, image_url: allUrls[0] } as any)
        .eq('id', itemId);
      if (updateError) throw updateError;
      toast.success(uploadedUrls.length > 1 ? `${uploadedUrls.length} תמונות צורפו לפריט` : 'תמונה צורפה לפריט');
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
  // Silently tries to mark apartment COMPLETED when all collection items are done.
  // Runs in its own try-catch so RLS / permission failures never surface as a
  // user-facing error on the item that was just updated successfully.
  const tryMarkApartmentCompleted = async () => {
    try {
      const { data: allItems } = await supabase
        .from('items')
        .select('intended_for_collection, collected')
        .eq('apartment_id', apartmentId);
      if (!allItems || allItems.length === 0) return;
      const forCollection = allItems.filter(i => i.intended_for_collection);
      if (forCollection.length === 0 || !forCollection.every(i => i.collected)) return;
      if (apartmentInfo?.status === 'COMPLETED') return;
      await supabase.from('apartments').update({ status: 'COMPLETED' }).eq('id', apartmentId);
      const { data: apartment } = await supabase
        .from('apartments').select('*, projects(name)').eq('id', apartmentId).single();
      if (apartment) {
        setApartmentInfo(apartment);
        toast.success('🎉 כל הפריטים נאספו! הדירה הושלמה.', { duration: 4000 });
        void fireWebhooks({
          event: 'apartment_completed',
          project_id: projectId,
          apartment_id: apartmentId,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.warn('apartment completion check skipped:', err);
    }
  };

  const updateItem = async (itemId: string, updates: Partial<Item>) => {
    try {
      const updateData: any = { ...updates };
      // Strip virtual join fields that aren't real DB columns
      delete updateData.created_by;
      delete updateData.collector_profile;

      if (updates.collected === true && !items.find(i => i.id === itemId)?.collected) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) updateData.collected_by_user_id = user.id;
        if (!('status' in updates)) updateData.status = 'collected';
      } else if (updates.collected === false) {
        updateData.collected_by_user_id = null;
        if (!('collected_by' in updates)) updateData.collected_by = null;
        if (!('status' in updates)) updateData.status = 'pending';
      }
      if (updates.status === 'discarded') {
        updateData.intended_for_collection = false;
      }

      let { error } = await supabase.from('items').update(updateData).eq('id', itemId);
      if (error) {
        // Fallback: retry without optional columns added in later migrations
        // (status, collected_by TEXT, photo_urls) in case production DB is behind.
        const coreData = Object.fromEntries(
          Object.entries(updateData).filter(([k]) =>
            !['status', 'collected_by', 'photo_urls', 'notes', 'collected_at'].includes(k)
          )
        );
        const retry = await supabase.from('items').update(coreData).eq('id', itemId);
        if (retry.error) throw retry.error;
      }

      await loadData();
      toast.success('פריט עודכן');

      // Apartment completion check runs independently — failures are swallowed.
      void tryMarkApartmentCompleted();
    } catch (error: any) {
      toast.error('שגיאה בעדכון פריט');
      console.error(error);
    }
  };
  // Immediately mark collected with the logged-in user's name — used for swipe-left
  const quickCollect = async (itemId: string) => {
    const name = currentUserName || localStorage.getItem('fc_last_collector') || '';
    if (name) localStorage.setItem('fc_last_collector', name);
    await updateItem(itemId, { collected: true, collected_by: name || null });
  };

  // Show "נאסף על ידי מי?" dialog before marking collected
  const requestCollection = (itemId: string) => {
    setIsReattribution(false);
    setCollectorInput(currentUserName || localStorage.getItem('fc_last_collector') || '');
    setPendingCollectionItemId(itemId);
    setShowAttributionDialog(true);
  };

  // Re-open the dialog to correct who collected an already-collected item
  const reattributeCollection = (itemId: string, currentCollector: string | null) => {
    setIsReattribution(true);
    setCollectorInput(currentCollector || localStorage.getItem('fc_last_collector') || '');
    setPendingCollectionItemId(itemId);
    setShowAttributionDialog(true);
  };

  const confirmCollection = async () => {
    if (!pendingCollectionItemId) return;
    setShowAttributionDialog(false);
    const name = collectorInput.trim();
    if (name) localStorage.setItem('fc_last_collector', name);
    const collectedItemId = pendingCollectionItemId;
    const collectedItem = items.find(i => i.id === collectedItemId);
    await updateItem(collectedItemId, {
      collected: true,
      collected_by: name || null,
    });
    void logAudit({
      action: 'item_collected',
      entity_type: 'item',
      entity_id: collectedItemId,
      entity_label: collectedItem?.description ?? 'פריט',
      project_id: projectId ?? null,
      apartment_id: apartmentId ?? null,
      actor_name: 'Worker',
      meta: { collector: name || null },
    });
    setPendingCollectionItemId(null);
    setCollectorInput('');
    setIsReattribution(false);
  };

  const markDiscarded = async (itemId: string, discarded: boolean) => {
    await updateItem(itemId, {
      status: discarded ? 'discarded' : 'pending',
      collected: false,
    });
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

  // Flat list of all photos across items — supports multiple photos per item.
  const photoItems = filteredItems.flatMap(i => {
    const urls = i.photo_urls?.length ? i.photo_urls : (i.image_url ? [i.image_url] : []);
    return urls.map((url, idx) => ({
      ...i,
      image_url: url,
      _photoIdx: idx,
      description: idx > 0 ? `${i.description} (${idx + 1})` : i.description,
    }));
  });
  const getStatusBadge = (status: string) => {
    const badges = {
      'NOT_STARTED': <Badge variant="secondary">לא הושלם</Badge>,
      'DOCUMENTING': <Badge className="bg-warning text-warning-foreground">בתיעוד</Badge>,
      'COMPLETED': <Badge className="bg-success text-success-foreground">הושלם</Badge>
    };
    return badges[status as keyof typeof badges];
  };

  // Prev/next apartment in same building
  const currentAptIdx = buildingApts.findIndex(a => a.id === apartmentId);
  const prevApt = currentAptIdx > 0 ? buildingApts[currentAptIdx - 1] : null;
  const nextApt = currentAptIdx < buildingApts.length - 1 ? buildingApts[currentAptIdx + 1] : null;

  if (loading) {
    return (
      <div className="min-h-screen bg-muted" dir="rtl">
        <PageHeader
          title={apartmentInfo ? `בניין ${apartmentInfo.building_number} · דירה ${apartmentInfo.apartment_number}` : 'טוען...'}
          subtitle={apartmentInfo?.projects?.name}
          onBack={() => navigate(`/projects/${projectId}`)}
        />
        <div className="px-3 sm:px-4 py-4 sm:py-6 space-y-2 sm:space-y-3">
          <SkeletonItemRow /><SkeletonItemRow /><SkeletonItemRow /><SkeletonItemRow />
        </div>
      </div>
    );
  }
  return <div className="min-h-screen bg-muted" dir="rtl">
      <PageHeader
        title={`בניין ${apartmentInfo?.building_number} · דירה ${apartmentInfo?.apartment_number}`}
        subtitle={apartmentInfo?.projects?.name}
        onBack={() => navigate(`/projects/${projectId}`)}
        actions={
          <>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setBulkMode(v => !v)}
              className="text-sidebar-foreground hover:bg-sidebar-accent h-8 w-8"
              title={bulkMode ? 'יציאה ממצב בחירה' : 'מצב בחירה מרובה'}
              aria-label={bulkMode ? 'יציאה ממצב בחירה' : 'מצב בחירה מרובה'}
            >
              <Check className={`h-4 w-4 ${bulkMode ? 'text-primary' : ''}`} />
            </Button>
            {getStatusBadge(apartmentInfo?.status)}
          </>
        }
        bottomSlot={!loading && (() => {
          const forCollection = items.filter(i => i.intended_for_collection && i.status !== 'discarded');
          const collectedCount = forCollection.filter(i => i.collected).length;
          const pct = forCollection.length > 0 ? (collectedCount / forCollection.length) * 100 : 0;
          const allDone = forCollection.length > 0 && collectedCount === forCollection.length;
          return (
            <div className="h-1 w-full bg-sidebar-foreground/20">
              <div
                className={`h-full transition-all duration-700 ease-out ${allDone ? 'bg-emerald-400' : 'bg-primary'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          );
        })()}
      />

      <main className="px-3 sm:px-4 py-4 sm:py-6 pb-40 w-full overflow-x-hidden">
        {/* Apartment navigation — prev/next within same building */}
        {(prevApt || nextApt) && (
          <div className="flex items-center justify-between mb-2 text-xs text-muted-foreground">
            <button
              type="button"
              onClick={() => prevApt && navigate(`/projects/${projectId}/apartments/${prevApt.id}`)}
              disabled={!prevApt}
              className="flex items-center gap-1 h-7 px-2 rounded-md hover:bg-muted disabled:opacity-30 transition-colors active:scale-95"
            >
              <ArrowLeft className="h-3.5 w-3.5 rotate-180" />
              <span>דירה {prevApt?.apartment_number}</span>
            </button>
            <span className="text-[10px] font-semibold tabular-nums">{currentAptIdx + 1} / {buildingApts.length} בבניין</span>
            <button
              type="button"
              onClick={() => nextApt && navigate(`/projects/${projectId}/apartments/${nextApt.id}`)}
              disabled={!nextApt}
              className="flex items-center gap-1 h-7 px-2 rounded-md hover:bg-muted disabled:opacity-30 transition-colors active:scale-95"
            >
              <span>דירה {nextApt?.apartment_number}</span>
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

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

        {/* Quick stats strip */}
        {items.length > 0 && (() => {
          const forCollection = items.filter(i => i.intended_for_collection && i.status !== 'discarded');
          const collectedCount = forCollection.filter(i => i.collected).length;
          const pendingCount = forCollection.length - collectedCount;
          const pct = forCollection.length > 0 ? Math.round((collectedCount / forCollection.length) * 100) : 0;
          const allDone = forCollection.length > 0 && collectedCount === forCollection.length;
          return (
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="bg-card border border-border rounded-xl px-3 py-2 text-center">
                <div className="text-lg font-extrabold tabular-nums">{forCollection.length}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">לאיסוף</div>
              </div>
              <div className="bg-card border border-border rounded-xl px-3 py-2 text-center">
                <div className={`text-lg font-extrabold tabular-nums ${allDone ? 'text-emerald-600 dark:text-emerald-400' : 'text-green-600 dark:text-green-400'}`}>{collectedCount}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">נאספו · {pct}%</div>
              </div>
              <div className="bg-card border border-border rounded-xl px-3 py-2 text-center">
                <div className={`text-lg font-extrabold tabular-nums ${pendingCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>{pendingCount}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">ממתינים</div>
              </div>
            </div>
          );
        })()}

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
            {/* View mode toggle */}
            <div className="flex-shrink-0 flex border border-border rounded-lg overflow-hidden mr-auto">
              <button type="button" onClick={() => setViewMode('list')}
                className={`h-9 w-9 flex items-center justify-center transition-colors ${viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
                title="תצוגת רשימה" aria-label="תצוגת רשימה">
                <List className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => setViewMode('gallery')}
                className={`h-9 w-9 flex items-center justify-center transition-colors ${viewMode === 'gallery' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
                title="גלריית תמונות" aria-label="גלריית תמונות">
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Bulk-action bar — appears when one or more items are selected */}
        {bulkMode && (
          <div className="sticky top-[4rem] sm:top-[4.5rem] z-20 bg-foreground text-background rounded-lg shadow-lg mb-3 p-2.5 sm:p-3 flex items-center gap-2">
            <span className="text-sm font-semibold flex-1 truncate">
              {bulkSelected.size} נבחרו
            </span>
            <Button size="sm" variant="secondary" onClick={startBulkCollect} disabled={bulkSelected.size === 0} className="h-8 gap-1">
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

        {/* Gallery view — photo grid for visually browsing items */}
        {viewMode === 'gallery' && !loading && filteredItems.length > 0 && (
          <div className="mb-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {filteredItems
                .filter(i => i.image_url || (i.photo_urls?.length ?? 0) > 0)
                .map(item => {
                  const photoIdx = photoItems.findIndex(p => p.id === item.id && (p as any)._photoIdx === 0);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setLightboxIndex(photoIdx >= 0 ? photoIdx : 0)}
                      className="relative rounded-xl overflow-hidden aspect-square bg-muted group active:scale-95 transition-transform duration-150"
                    >
                      <img
                        src={item.photo_urls?.[0] ?? item.image_url!}
                        alt={item.description}
                        className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                      <div className="absolute bottom-0 inset-x-0 p-2 text-right">
                        <p className="text-white text-xs font-semibold line-clamp-2 leading-tight">{item.description}</p>
                        {item.location && <p className="text-white/70 text-[10px]">{item.location}</p>}
                        {item.collected && (
                          <span className="inline-flex items-center gap-0.5 text-[9px] bg-emerald-500 text-white rounded-full px-1.5 py-0.5 mt-0.5">
                            <Check className="h-2.5 w-2.5" strokeWidth={2.5} /> נאסף
                          </span>
                        )}
                      </div>
                      {(item.photo_urls?.length ?? 0) > 1 && (
                        <span className="absolute top-1.5 left-1.5 bg-black/60 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                          {item.photo_urls!.length}
                        </span>
                      )}
                    </button>
                  );
                })}
            </div>
            {filteredItems.filter(i => !i.image_url && !(i.photo_urls?.length)).length > 0 && (
              <p className="text-xs text-muted-foreground text-center mt-3">
                {filteredItems.filter(i => !i.image_url && !(i.photo_urls?.length)).length} פריטים ללא תמונה — עבור לתצוגת רשימה לעריכתם
              </p>
            )}
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
        ) : viewMode === 'list' ? (
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
                      onToggleCollected={() => {
                        if (!item.collected) void quickCollect(item.id);
                        else updateItem(item.id, { collected: false });
                      }}
                    >
                    <Card
                      className={`w-full transition-all duration-150 ${bulkSelected.has(item.id) ? 'ring-2 ring-primary ring-offset-1 bg-primary/5' : ''} ${item.status === 'discarded' ? 'opacity-60' : ''}`}
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
                            {(item.image_url || (item.photo_urls?.length ?? 0) > 0) && (
                              <button
                                type="button"
                                onClick={e => {
                                  if (bulkMode) return;
                                  e.stopPropagation();
                                  const idx = photoItems.findIndex(p => p.id === item.id && (p as any)._photoIdx === 0);
                                  setLightboxIndex(idx >= 0 ? idx : 0);
                                }}
                                className="flex-shrink-0 block h-14 w-14 sm:h-16 sm:w-16 rounded-md overflow-hidden border border-border bg-muted relative"
                                aria-label="הצג תמונת פריט"
                              >
                                <img src={item.photo_urls?.[0] ?? item.image_url!} alt={item.description} className="h-full w-full object-cover" loading="lazy" />
                                {(item.photo_urls?.length ?? 0) > 1 && (
                                  <span className="absolute bottom-0 right-0 bg-foreground/70 text-background text-[9px] px-1 rounded-tl">
                                    {item.photo_urls!.length}
                                  </span>
                                )}
                                <button
                                  type="button"
                                  aria-label="ציור על תמונה"
                                  onClick={e => { e.stopPropagation(); setAnnotatingItem(item); }}
                                  className="absolute bottom-0 left-0 h-5 w-5 flex items-center justify-center rounded-tr bg-background/80 backdrop-blur-sm text-foreground hover:text-primary transition-colors"
                                >
                                  <Pen className="h-3 w-3" />
                                </button>
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
                        {item.item_category && <><span>•</span><span className="whitespace-nowrap font-medium text-foreground/70">{item.item_category}</span></>}
                        <span>•</span>
                        <span className="capitalize whitespace-nowrap">{item.material_category}</span>
                        {item.estimated_weight_kg != null && (
                          <><span>•</span><span className="whitespace-nowrap">{item.estimated_weight_kg} ק"ג</span></>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5 sm:gap-2 text-xs text-muted-foreground mt-1">
                        {item.created_by && <span className="break-words">הוסף על ידי: {item.created_by.name}</span>}
                        {item.collected ? (
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); reattributeCollection(item.id, item.collected_by || item.collector_profile?.name || null); }}
                            className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
                            title="לחץ לעריכת שם האוסף"
                          >
                            <Check className="h-3 w-3" />
                            נאסף{(item.collected_by || item.collector_profile?.name) ? ` על ידי: ${item.collected_by || item.collector_profile?.name}` : ''}
                          </button>
                        ) : null}
                        {item.status === 'discarded' && (
                          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-destructive/15 text-destructive">
                            <Ban className="h-2.5 w-2.5" /> נזרק
                          </span>
                        )}
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
                        onClick={() => openItemPhotoPicker(item.id)}
                        className="h-9 w-9 sm:h-10 sm:w-10 relative"
                        aria-label="הוסף תמונה"
                        title="הוסף תמונה לפריט"
                      >
                        <Camera className={`h-4 w-4 ${(item.photo_urls?.length ?? (item.image_url ? 1 : 0)) > 0 ? 'text-success' : ''}`} />
                        {(item.photo_urls?.length ?? 0) > 0 && (
                          <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 bg-primary text-primary-foreground rounded-full text-[8px] flex items-center justify-center leading-none">
                            {item.photo_urls!.length}
                          </span>
                        )}
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => {
                    setDeletingItemId(item.id);
                    setShowDeleteDialog(true);
                  }} className="h-9 w-9 sm:h-10 sm:w-10 text-destructive hover:text-destructive hover:bg-destructive/10">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className={`flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 pt-2 border-t ${item.status === 'discarded' ? 'opacity-50' : ''}`}>
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-xs sm:text-sm whitespace-nowrap">לאיסוף:</span>
                      <Switch
                        checked={item.intended_for_collection}
                        onCheckedChange={checked => updateItem(item.id, { intended_for_collection: checked })}
                        disabled={userRole === 'WORKER' || item.status === 'discarded'}
                      />
                    </div>
                    {item.intended_for_collection && item.status !== 'discarded' && (
                      <div className="flex items-center gap-2 flex-1">
                        <span className="text-xs sm:text-sm whitespace-nowrap">נאסף:</span>
                        <Switch
                          checked={item.collected}
                          onCheckedChange={checked => {
                            if (checked) requestCollection(item.id);
                            else updateItem(item.id, { collected: false });
                          }}
                        />
                      </div>
                    )}
                    <Button
                      variant={item.status === 'discarded' ? 'destructive' : 'ghost'}
                      size="sm"
                      onClick={() => markDiscarded(item.id, item.status !== 'discarded')}
                      className={`h-7 text-xs gap-1 flex-shrink-0 ${item.status !== 'discarded' ? 'text-muted-foreground hover:text-destructive' : ''}`}
                      title={item.status === 'discarded' ? 'בטל סימון נזרק' : 'סמן כנזרק'}
                    >
                      <Ban className="h-3 w-3" />
                      <span>נזרק</span>
                    </Button>
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
        ) : null}
      </main>

      {createPortal(<div className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t shadow-lg" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {/* Apartment context strip — always-visible reminder of which unit is active */}
        <div className="flex items-center justify-center gap-2 bg-sidebar text-sidebar-foreground px-3 py-1 text-xs font-bold tracking-wide">
          <span>בניין {apartmentInfo?.building_number}</span>
          <span className="opacity-40">·</span>
          <span>דירה {apartmentInfo?.apartment_number}</span>
          {apartmentInfo?.projects?.name && (
            <span className="opacity-50 font-normal">— {apartmentInfo.projects.name}</span>
          )}
        </div>
        {/* Row 1 — Primary voice action (full width) */}
        <div className="px-2 pt-2 pb-1.5">
          <Button onClick={toggleRecording} size="lg" className="w-full gap-2 h-12 text-base relative" variant={recording ? "destructive" : processing ? "secondary" : "default"} disabled={processing || scanning}>
            {processing ? <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-current"></div>
                <span>מעבד נתונים...</span>
              </> : recording ? <>
                <Mic className="h-5 w-5 animate-pulse" />
                <span>עצור הקלטה</span>
              </> : <>
                <Mic className="h-5 w-5" />
                <span>הקלט פריטים</span>
              </>}
          </Button>
        </div>
        {/* Row 2 — Secondary actions: horizontally scrollable so all are reachable */}
        <div className="flex gap-1.5 overflow-x-auto px-2 pb-2 scrollbar-none" style={{ scrollbarWidth: 'none' }}>
          {/* פריט בודד — single-shot: ONE photo → AI creates ONE item */}
          <Button
            onClick={openCameraPicker}
            size="sm"
            variant={scanning && !multiPhotoMode ? 'secondary' : 'outline'}
            disabled={recording || processing || scanning || roomScanning || multiPhotoMode}
            className="flex-shrink-0 flex-col gap-0.5 py-1.5 px-3 min-w-[68px] h-auto border-sky-400 text-sky-700 hover:bg-sky-50 disabled:opacity-40"
          >
            {scanning && !multiPhotoMode ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-sky-500" />
            ) : (
              <Camera className="h-4 w-4 text-sky-600" />
            )}
            <span className="text-[10px] leading-none font-bold">פריט בודד</span>
            <span className="text-[9px] leading-none opacity-60">AI מזהה</span>
          </Button>
          {/* מגלריה — upload photos already taken */}
          <Button
            onClick={openMultiUploadPicker}
            size="sm"
            variant={multiUploading ? 'secondary' : 'outline'}
            disabled={recording || processing || scanning || roomScanning || multiPhotoMode || multiUploading}
            className="flex-shrink-0 flex-col gap-0.5 px-3 min-w-[68px] py-1.5 h-auto"
          >
            {multiUploading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" />
                {multiUploadProgress && (
                  <span className="text-[10px] leading-none tabular-nums">{multiUploadProgress.current}/{multiUploadProgress.total}</span>
                )}
              </>
            ) : (
              <>
                <Images className="h-4 w-4" />
                <span className="text-[10px] leading-none font-bold">מגלריה</span>
                <span className="text-[9px] leading-none opacity-60">מה שצילמת</span>
              </>
            )}
          </Button>
          {/* כל הדירה — continuous: opens camera again after each item */}
          <Button
            onClick={multiPhotoMode ? endMultiPhotoMode : startMultiPhotoMode}
            size="sm"
            variant={multiPhotoMode ? 'default' : 'outline'}
            disabled={recording || processing || scanning || roomScanning || multiUploading}
            className={`flex-shrink-0 flex-col gap-0.5 py-1.5 px-3 min-w-[68px] h-auto ${
              multiPhotoMode
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600'
                : 'border-emerald-500 text-emerald-700 hover:bg-emerald-50'
            }`}
          >
            {multiPhotoMode && scanning ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" />
            ) : (
              <Repeat2 className="h-4 w-4" />
            )}
            <span className="text-[10px] leading-none font-bold">
              {multiPhotoMode ? `עצור (${photoCaptureCount})` : 'כל הדירה'}
            </span>
            {!multiPhotoMode && <span className="text-[9px] leading-none opacity-60">בזרימה</span>}
          </Button>
          {/* חדר שלם — room sweep: ONE photo → many items */}
          <Button
            onClick={openRoomPicker}
            size="sm"
            variant={roomScanning ? 'secondary' : 'outline'}
            disabled={recording || processing || scanning || roomScanning}
            className="flex-shrink-0 flex-col gap-0.5 px-3 min-w-[68px] py-1.5 h-auto"
          >
            {roomScanning ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-muted-foreground" />
            ) : (
              <Scan className="h-4 w-4" />
            )}
            <span className="text-[10px] leading-none font-bold">חדר שלם</span>
            <span className="text-[9px] leading-none opacity-60">סריקה מלאה</span>
          </Button>
          {/* בשלבים — guided: room-by-room with prompts */}
          <Button
            onClick={() => setShowGuided(true)}
            size="sm"
            variant="outline"
            disabled={recording || processing || scanning || roomScanning}
            className="flex-shrink-0 flex-col gap-0.5 px-3 min-w-[68px] py-1.5 h-auto border-primary/40"
          >
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-[10px] leading-none font-bold">בשלבים</span>
            <span className="text-[9px] leading-none opacity-60">חדר-חדר</span>
          </Button>
          {/* ידני */}
          <Button
            onClick={() => setShowManualDialog(true)}
            size="sm"
            variant="outline"
            disabled={recording || processing || scanning}
            className="flex-shrink-0 flex-col gap-0.5 px-3 min-w-[68px] py-1.5 h-auto"
          >
            <Plus className="h-4 w-4" />
            <span className="text-[10px] leading-none font-bold">ידנית</span>
            <span className="text-[9px] leading-none opacity-60">הקלד</span>
          </Button>
          {/* מדריך */}
          <Button
            onClick={() => setShowModeHelp(true)}
            size="sm"
            variant="ghost"
            className="flex-shrink-0 flex-col gap-0.5 px-3 min-w-[56px] py-1.5 h-auto text-muted-foreground"
          >
            <HelpCircle className="h-4 w-4" />
            <span className="text-[9px] leading-none">מדריך</span>
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
        {/* Hidden input for the per-item Camera icon (attach photo to existing item). No capture= so OS shows camera+gallery choice; multiple allows selecting several at once. */}
        <input
          ref={itemPhotoInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={attachPhotoToItem}
        />
        {/* Hidden input for multi-gallery upload — creates new items via AI for each photo. */}
        <input
          ref={multiUploadInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleMultiUpload}
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
      </div>, document.body)}

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

      {/* Multi-photo continue capture dialog
          ⚠️  "צלם עוד" MUST be a <label> that directly triggers the file input —
          programmatic .click() from a button callback is blocked on iOS/Android */}
      <Dialog open={showContinueCaptureDialog} onOpenChange={(open) => { if (!open) endMultiPhotoMode(); }}>
        <DialogContent dir="rtl" className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Check className="h-5 w-5 text-emerald-500" />
              פריט {photoCaptureCount} נוסף!
            </DialogTitle>
            <DialogDescription>
              לחץ "צלם עוד" לצילום הפריט הבא, או "סיום" לסיום הסשן.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={endMultiPhotoMode} className="gap-2">
              <X className="h-4 w-4" />
              סיום ({photoCaptureCount})
            </Button>
            {/* Label triggers continueInputRef directly — trusted user gesture, works on mobile */}
            <label htmlFor="fc-continue-capture" className="cursor-pointer">
              <span className="inline-flex items-center gap-2 h-9 px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors select-none">
                <Camera className="h-4 w-4" />
                צלם עוד
              </span>
            </label>
          </div>
        </DialogContent>
      </Dialog>
      {/* Dedicated input for the continue-capture label above */}
      <input
        id="fc-continue-capture"
        ref={continueInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleContinueCapture}
      />

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


      {/* In-app camera overlay — desktop getUserMedia flow */}
      <CameraCapture
        open={showCamera}
        onClose={() => setShowCamera(false)}
        onCapture={handleCameraCapture}
      />

      {/* Edit Item — Drawer on mobile, Dialog on desktop */}
      {isMobile ? (
        <Drawer open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DrawerContent dir="rtl" className="px-4 pb-6">
            <DrawerHeader className="text-right">
              <DrawerTitle>עריכת פריט</DrawerTitle>
            </DrawerHeader>
            {editingItem && <div className="space-y-4 overflow-y-auto max-h-[65vh]">
              <div>
                <Label>תיאור</Label>
                <Input value={editingItem.description} onChange={e => setEditingItem({ ...editingItem, description: e.target.value })} />
              </div>
              <div>
                <Label>קטגוריה</Label>
                <Select value={editingItem.item_category ?? ''} onValueChange={value => setEditingItem({ ...editingItem, item_category: value })}>
                  <SelectTrigger><SelectValue placeholder="בחר קטגוריה" /></SelectTrigger>
                  <SelectContent>{ITEM_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>כמות</Label>
                <Input type="number" value={editingItem.quantity} onChange={e => setEditingItem({ ...editingItem, quantity: parseInt(e.target.value) || 1 })} />
              </div>
              <div>
                <Label>מיקום</Label>
                <Input value={editingItem.location || ''} onChange={e => setEditingItem({ ...editingItem, location: e.target.value })} />
              </div>
              <div>
                <Label>סוג פריט</Label>
                <Select value={editingItem.item_type} onValueChange={value => setEditingItem({ ...editingItem, item_type: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
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
                <Select value={editingItem.material_category} onValueChange={value => setEditingItem({ ...editingItem, material_category: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
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
              <Button onClick={() => { updateItem(editingItem.id, { description: editingItem.description, quantity: editingItem.quantity, location: editingItem.location, item_type: editingItem.item_type, material_category: editingItem.material_category, item_category: editingItem.item_category ?? null } as any); setShowEditDialog(false); }} className="w-full">
                שמור שינויים
              </Button>
              <Button type="button" variant="outline" onClick={async () => { if (!editingItem) return; await estimateResale(editingItem); setShowEditDialog(false); }} className="w-full gap-2">
                <DollarSign className="h-4 w-4" />
                הערכת שווי (AI)
                {typeof editingItem.estimated_resale_ils === 'number' && editingItem.estimated_resale_ils > 0 && (
                  <span className="text-xs text-muted-foreground">· נוכחי: ₪{editingItem.estimated_resale_ils}</span>
                )}
              </Button>
            </div>}
          </DrawerContent>
        </Drawer>
      ) : (
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
                <Label>קטגוריה</Label>
                <Select value={editingItem.item_category ?? ''} onValueChange={value => setEditingItem({ ...editingItem, item_category: value })}>
                  <SelectTrigger><SelectValue placeholder="בחר קטגוריה" /></SelectTrigger>
                  <SelectContent>{ITEM_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
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
              material_category: editingItem.material_category,
              item_category: editingItem.item_category ?? null,
            } as any);
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
      )}

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
                {/* Quick-insert templates */}
                <div className="mt-1.5 mb-2">
                  <p className="text-[11px] text-muted-foreground mb-1.5">הוספה מהירה:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {['ספה תלת-מושבית','מיטה זוגית עם מזרן','ארון בגדים','שולחן אוכל עם כסאות','מקרר','מכונת כביסה','ספת שינה','שולחן קפה','כוננית ספרים','מנורה עמידה','מכשיר טלוויזיה','מזגן','כיסא משרדי','מיטת יחיד','שולחן כתיבה'].map(t => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setManualItem(prev => ({ description: prev.description ? `${prev.description}\n${t}` : t }))}
                        className="text-xs px-2.5 py-1 rounded-full border border-border bg-muted hover:bg-accent/40 hover:border-accent transition-colors"
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
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

      {/* Collection Attribution Dialog — initial collection or re-attribution */}
      <Dialog open={showAttributionDialog} onOpenChange={open => {
        if (!open) { setShowAttributionDialog(false); setPendingCollectionItemId(null); setIsReattribution(false); }
      }}>
        <DialogContent dir="rtl" className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              {isReattribution ? 'עריכת שם האוסף' : 'מי אסף את הפריט?'}
            </DialogTitle>
            <DialogDescription>
              {isReattribution ? 'שנה את שם האוסף המשויך לפריט זה' : 'הזן שם לצורך מעקב — ניתן לדלג'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <Input
              placeholder="שם האוסף (אופציונלי)"
              value={collectorInput}
              onChange={e => setCollectorInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void confirmCollection(); }}
              autoFocus
              dir="rtl"
            />
            <div className="flex gap-2">
              <Button onClick={() => void confirmCollection()} className="flex-1 gap-2">
                <Check className="h-4 w-4" />
                {collectorInput.trim() ? 'אשר' : 'ללא שם'}
              </Button>
              <Button variant="outline" onClick={() => {
                setShowAttributionDialog(false);
                setPendingCollectionItemId(null);
                setIsReattribution(false);
              }} className="flex-shrink-0">
                ביטול
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Collect Attribution Dialog */}
      <Dialog open={showBulkCollectDialog} onOpenChange={open => { if (!open) setShowBulkCollectDialog(false); }}>
        <DialogContent dir="rtl" className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              מי אסף את הפריטים?
            </DialogTitle>
            <DialogDescription>
              {bulkSelected.size} פריטים יסומנו כנאספו — הזן שם לצורך מעקב
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <Input
              placeholder="שם האוסף (אופציונלי)"
              value={bulkCollectorInput}
              onChange={e => setBulkCollectorInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void confirmBulkCollect(); }}
              autoFocus
              dir="rtl"
            />
            <div className="flex gap-2">
              <Button onClick={() => void confirmBulkCollect()} className="flex-1 gap-2">
                <Check className="h-4 w-4" />
                {bulkCollectorInput.trim() ? `סמן ${bulkSelected.size} כנאספו` : `סמן ${bulkSelected.size} ללא שם`}
              </Button>
              <Button variant="outline" onClick={() => setShowBulkCollectDialog(false)} className="flex-shrink-0">
                ביטול
              </Button>
            </div>
          </div>
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

      <PhotoAnnotation
        open={annotatingItem !== null}
        imageUrl={annotatingItem?.image_url ?? annotatingItem?.photo_urls?.[0] ?? ''}
        onClose={() => setAnnotatingItem(null)}
        onSave={(blob) => { if (annotatingItem) handleAnnotationSave(blob, annotatingItem); }}
      />

      {/* Mode help sheet */}
      <Dialog open={showModeHelp} onOpenChange={setShowModeHelp}>
        <DialogContent dir="rtl" className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <HelpCircle className="h-5 w-5 text-primary" />
              מדריך מצבי עבודה
            </DialogTitle>
            <DialogDescription>בחר את המצב שמתאים לצורת העבודה שלך בשטח</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            {[
              {
                icon: <Mic className="h-5 w-5 text-primary" />,
                name: 'הקלטה קולית',
                tag: 'מהיר ביותר',
                tagColor: 'bg-primary/10 text-primary',
                when: 'כשהידיים עסוקות או כשרוצים לתעד הרבה פריטים בלי לעצור',
                advantage: 'מדברים בטבעיות — "שתי כורסאות עץ בסלון" — והAI מפרק לפריטים',
              },
              {
                icon: <Camera className="h-5 w-5 text-sky-600" />,
                name: 'פריט בודד',
                tag: 'מדויק',
                tagColor: 'bg-sky-100 text-sky-700',
                when: 'כשצריך לתעד פריט ספציפי עם תמונה ברורה',
                advantage: 'צילום אחד → AI מזהה את הפריט ויוצר כרטיס אוטומטי',
              },
              {
                icon: <Images className="h-5 w-5" />,
                name: 'מגלריה',
                tag: 'גמיש',
                tagColor: 'bg-muted text-muted-foreground',
                when: 'כשצילמת את הדירה קודם ועכשיו מעלים מהגלריה',
                advantage: 'לא צריך להיות בדירה — אפשר לתעד בשקט מבחוץ אחרי הביקור',
              },
              {
                icon: <Repeat2 className="h-5 w-5 text-emerald-600" />,
                name: 'כל הדירה — בזרימה',
                tag: 'מהיר בשטח',
                tagColor: 'bg-emerald-100 text-emerald-700',
                when: 'כשעוברים בכל הדירה ומצלמים פריט אחרי פריט ברצף',
                advantage: 'המצלמה נפתחת מחדש אחרי כל פריט — ממשיכים ללא הפסקה',
              },
              {
                icon: <Scan className="h-5 w-5" />,
                name: 'חדר שלם — סריקה מלאה',
                tag: 'יעיל',
                tagColor: 'bg-amber-100 text-amber-700',
                when: 'כשנמצאים בחדר ספציפי ורוצים לתעד הכל בצילום אחד',
                advantage: 'AI מזהה את כל הפריטים בתמונה — מסמנים מה רלוונטי ומוחקים מה שלא',
              },
              {
                icon: <Sparkles className="h-5 w-5 text-primary" />,
                name: 'בשלבים — חדר-חדר',
                tag: 'מקיף',
                tagColor: 'bg-primary/10 text-primary',
                when: 'כשרוצים לוודא שלא פספסו אף חדר',
                advantage: 'המערכת מנחה חדר אחרי חדר — פחות פספוסים, מיפוי מסודר',
              },
              {
                icon: <Plus className="h-5 w-5" />,
                name: 'ידנית — הקלד',
                tag: 'בקרה מלאה',
                tagColor: 'bg-muted text-muted-foreground',
                when: 'כשרוצים להוסיף פריט עם שם מדויק שנבחר ידנית',
                advantage: 'שליטה מלאה על הפרטים — שם, כמות, חדר, חומר',
              },
            ].map(m => (
              <div key={m.name} className="flex gap-3 p-3 rounded-xl border bg-card">
                <div className="mt-0.5 flex-shrink-0">{m.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm">{m.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${m.tagColor}`}>{m.tag}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5"><span className="font-medium text-foreground">מתי: </span>{m.when}</p>
                  <p className="text-xs text-muted-foreground mt-0.5"><span className="font-medium text-foreground">יתרון: </span>{m.advantage}</p>
                </div>
              </div>
            ))}
          </div>
          <Button className="w-full mt-2" onClick={() => setShowModeHelp(false)}>הבנתי, תודה</Button>
        </DialogContent>
      </Dialog>
    </div>;
}