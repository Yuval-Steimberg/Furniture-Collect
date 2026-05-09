import { useCallback } from 'react';
import { useOnReconnect } from '@/hooks/useNetworkStatus';
import {
  getPendingRecordings,
  getPendingImages,
  updateRecordingStatus,
  updateImageStatus,
} from '@/lib/offlineQueue';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function useOfflineSync(): void {
  const syncAll = useCallback(async () => {
    const [pending, pendingImages] = await Promise.all([
      getPendingRecordings(),
      getPendingImages(),
    ]);
    if (pending.length + pendingImages.length === 0) return;
    toast.info(`מסנכרן ${pending.length + pendingImages.length} פריטים...`);

    // sync recordings
    for (const rec of pending) {
      try {
        await updateRecordingStatus(rec.id, 'syncing', { attempts: rec.attempts + 1 });
        const base64 = await blobToBase64(rec.audio_blob);
        const { data, error } = await supabase.functions.invoke('parse-voice-items', { body: { audio: base64 } });
        if (error) throw error;
        const parsedItems: any[] = data?.items ?? [];
        if (parsedItems.length > 0) {
          const rows = parsedItems.map((item: any) => ({
            apartment_id: rec.apartment_id,
            project_id: rec.project_id,
            created_by_user_id: rec.user_id,
            description: item.description,
            quantity: item.quantity ?? 1,
            location: item.location ?? null,
            intended_for_collection: item.intended_for_collection ?? true,
            item_type: item.item_type ?? 'furniture',
            material_category: item.material_category ?? 'other',
            estimated_weight_kg: item.estimated_weight_kg ?? null,
            source: 'voice',
          }));
          await supabase.from('items').insert(rows);
        }
        await updateRecordingStatus(rec.id, 'synced', {
          transcription: data?.transcription ?? null,
          parsed_items_count: parsedItems.length,
        });
      } catch (err: any) {
        await updateRecordingStatus(rec.id, 'failed', { last_error: err?.message ?? 'unknown' });
      }
    }

    // sync images
    for (const img of pendingImages) {
      try {
        await updateImageStatus(img.id, 'syncing', { attempts: img.attempts + 1 });
        const base64 = await blobToBase64(img.image_blob);
        const { data: parseData, error: parseError } = await supabase.functions.invoke('parse-image-item', {
          body: { image_base64: base64, apartment_id: img.apartment_id },
        });
        if (parseError) throw parseError;
        const parsed = parseData?.item;
        if (parsed?.description) {
          // Upload image to storage
          const compressed = img.image_blob;
          const photoUuid = crypto.randomUUID();
          const path = `${img.project_id}/${img.apartment_id}/${photoUuid}.jpg`;
          const { error: uploadError } = await supabase.storage
            .from('item-photos')
            .upload(path, compressed, { contentType: 'image/jpeg', upsert: false });
          const imageUrl = uploadError
            ? null
            : supabase.storage.from('item-photos').getPublicUrl(path).data.publicUrl;
          await supabase.from('items').insert({
            apartment_id: img.apartment_id,
            project_id: img.project_id,
            created_by_user_id: img.user_id,
            description: parsed.description,
            quantity: parsed.quantity ?? 1,
            location: parsed.location ?? null,
            intended_for_collection: parsed.intended_for_collection ?? true,
            item_type: parsed.item_type ?? 'furniture',
            material_category: parsed.material_category ?? 'other',
            estimated_weight_kg: parsed.estimated_weight_kg ?? null,
            source: 'image',
            image_url: imageUrl,
            photo_urls: imageUrl ? [imageUrl] : null,
          } as any);
        }
        await updateImageStatus(img.id, 'synced');
      } catch (err: any) {
        await updateImageStatus(img.id, 'failed', { last_error: err?.message ?? 'unknown' });
      }
    }

    const totalSynced = pending.length + pendingImages.length;
    toast.success(`${totalSynced} פריטים סונכרנו בהצלחה`);
  }, []);

  useOnReconnect(syncAll);
}
