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
import { ArrowLeft, Mic, Edit2, Camera, Check, X, Plus, Menu, Trash2, ImagePlus, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

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
  const [scanning, setScanning] = useState(false);
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
      } catch (error) {
        toast.error('לא ניתן לגשת למיקרופון');
        console.error(error);
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
      
      const { error } = await supabase.from('items').insert(itemsToInsert);
      if (error) throw error;
      
      // Show success with item count
      toast.success(`${itemsToAdd.length} פריטים נוספו בהצלחה`);
      
      // Reload and reset state
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
      const {
        error: insertError
      } = await supabase.from('items').insert(itemsToInsert);
      if (insertError) throw insertError;
      toast.success(`${data.items.length} פריטים נוספו בהצלחה`);
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
      const compressed = await compressImageToJpeg(file, 1600, 0.8);
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
      const { error: insertError } = await supabase.from('items').insert({
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
      } as any);
      if (insertError) throw insertError;

      const lowConf = (parsed.ai_confidence ?? 1) < 0.6;
      toast.success(
        lowConf ? 'פריט נוסף — מומלץ לאמת תיאור' : `פריט נוסף · ${parsed.description}`,
      );
      await loadData();
    } catch (err: any) {
      console.error('scan failed:', err);
      toast.error(err?.message ? `שגיאה בסריקה: ${err.message}` : 'שגיאה בסריקה');
    } finally {
      setScanning(false);
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
    if (filter === 'all') return true;
    if (filter === 'collection') return item.intended_for_collection;
    if (filter === 'no_collection') return !item.intended_for_collection;
    if (filter === 'pending') return item.intended_for_collection && !item.collected;
    return true;
  });
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
            <div className="flex-shrink-0">
              {getStatusBadge(apartmentInfo?.status)}
            </div>
          </div>
        </div>
      </header>

      <main className="px-3 sm:px-4 py-4 sm:py-6 w-full">
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

        <div className="space-y-2 sm:space-y-3 w-full">
          {filteredItems.map(item => <Card key={item.id} className="w-full">
              <CardContent className="p-3 sm:p-4">
                <div className="flex flex-col gap-2">
                  <div className="flex items-start gap-2 sm:gap-3 w-full">
                    {item.image_url && (
                      <a
                        href={item.image_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-shrink-0 block h-14 w-14 sm:h-16 sm:w-16 rounded-md overflow-hidden border border-border bg-muted"
                        aria-label="הצג תמונת פריט"
                      >
                        <img src={item.image_url} alt={item.description} className="h-full w-full object-cover" loading="lazy" />
                      </a>
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
                      {item.image_url ? <Button variant="ghost" size="icon" className="h-9 w-9 sm:h-10 sm:w-10">
                          <Camera className="h-4 w-4 text-success" />
                        </Button> : <Button variant="ghost" size="icon" className="text-muted-foreground h-9 w-9 sm:h-10 sm:w-10">
                          <Camera className="h-4 w-4" />
                        </Button>}
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
            </Card>)}

          {filteredItems.length === 0 && <Card className="w-full">
              <CardContent className="py-12 text-center text-muted-foreground">
                אין פריטים להצגה
              </CardContent>
            </Card>}
        </div>
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
            disabled={recording || processing || scanning}
            className="gap-2 h-12 sm:h-14 px-3 sm:px-4"
            aria-label="צלם פריט"
            title="צלם פריט (AI)"
          >
            {scanning ? (
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
      </div>


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