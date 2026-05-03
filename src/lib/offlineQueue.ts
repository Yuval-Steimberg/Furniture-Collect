/**
 * Offline Queue Manager using IndexedDB
 * Stores voice recordings and images for later sync when offline
 */

import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'jas-evacuation';
const DB_VERSION = 1;

export type RecordingStatus = 'pending' | 'syncing' | 'failed' | 'synced';

export interface OfflineRecording {
  id: string;
  apartment_id: string;
  project_id: string;
  user_id: string;
  audio_blob: Blob;
  recorded_at: number;
  status: RecordingStatus;
  attempts: number;
  last_error: string | null;
  transcription: string | null;
  parsed_items_count: number | null;
}

export interface OfflineImage {
  id: string;
  apartment_id: string;
  project_id: string;
  user_id: string;
  image_blob: Blob;
  captured_at: number;
  status: RecordingStatus;
  attempts: number;
  last_error: string | null;
  parsed_item_id: string | null;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

/**
 * Initialize the IndexedDB database
 */
async function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Recordings store
        if (!db.objectStoreNames.contains('recordings')) {
          const recordingsStore = db.createObjectStore('recordings', { keyPath: 'id' });
          recordingsStore.createIndex('status', 'status');
          recordingsStore.createIndex('apartment_id', 'apartment_id');
        }
        // Images store
        if (!db.objectStoreNames.contains('images')) {
          const imagesStore = db.createObjectStore('images', { keyPath: 'id' });
          imagesStore.createIndex('status', 'status');
          imagesStore.createIndex('apartment_id', 'apartment_id');
        }
      },
    });
  }
  return dbPromise;
}

/**
 * Add a new recording to the offline queue
 */
export async function addRecording(recording: Omit<OfflineRecording, 'status' | 'attempts' | 'last_error' | 'transcription' | 'parsed_items_count'>): Promise<void> {
  const db = await getDB();
  await db.put('recordings', {
    ...recording,
    status: 'pending',
    attempts: 0,
    last_error: null,
    transcription: null,
    parsed_items_count: null,
  });
}

/**
 * Add a new image to the offline queue
 */
export async function addImage(image: Omit<OfflineImage, 'status' | 'attempts' | 'last_error' | 'parsed_item_id'>): Promise<void> {
  const db = await getDB();
  await db.put('images', {
    ...image,
    status: 'pending',
    attempts: 0,
    last_error: null,
    parsed_item_id: null,
  });
}

/**
 * Get all pending recordings
 */
export async function getPendingRecordings(): Promise<OfflineRecording[]> {
  const db = await getDB();
  return db.getAllFromIndex('recordings', 'status', 'pending');
}

/**
 * Get all pending images
 */
export async function getPendingImages(): Promise<OfflineImage[]> {
  const db = await getDB();
  return db.getAllFromIndex('images', 'status', 'pending');
}

/**
 * Get count of pending items (recordings + images)
 */
export async function getPendingCount(): Promise<{ recordings: number; images: number; total: number }> {
  const db = await getDB();
  const recordings = await db.countFromIndex('recordings', 'status', 'pending');
  const images = await db.countFromIndex('images', 'status', 'pending');
  return { recordings, images, total: recordings + images };
}

/**
 * Get count of failed items
 */
export async function getFailedCount(): Promise<{ recordings: number; images: number; total: number }> {
  const db = await getDB();
  const recordings = await db.countFromIndex('recordings', 'status', 'failed');
  const images = await db.countFromIndex('images', 'status', 'failed');
  return { recordings, images, total: recordings + images };
}

/**
 * Update recording status
 */
export async function updateRecordingStatus(
  id: string,
  status: RecordingStatus,
  extra?: Partial<Pick<OfflineRecording, 'last_error' | 'transcription' | 'parsed_items_count' | 'attempts'>>
): Promise<void> {
  const db = await getDB();
  const recording = await db.get('recordings', id);
  if (recording) {
    await db.put('recordings', {
      ...recording,
      status,
      ...extra,
    });
  }
}

/**
 * Update image status
 */
export async function updateImageStatus(
  id: string,
  status: RecordingStatus,
  extra?: Partial<Pick<OfflineImage, 'last_error' | 'parsed_item_id' | 'attempts'>>
): Promise<void> {
  const db = await getDB();
  const image = await db.get('images', id);
  if (image) {
    await db.put('images', {
      ...image,
      status,
      ...extra,
    });
  }
}

/**
 * Delete a recording from the queue
 */
export async function deleteRecording(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('recordings', id);
}

/**
 * Delete an image from the queue
 */
export async function deleteImage(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('images', id);
}

/**
 * Clean up synced recordings older than 7 days
 */
export async function cleanupSyncedRecordings(): Promise<number> {
  const db = await getDB();
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const synced = await db.getAllFromIndex('recordings', 'status', 'synced');
  let deleted = 0;
  for (const recording of synced) {
    if (recording.recorded_at < sevenDaysAgo) {
      await db.delete('recordings', recording.id);
      deleted++;
    }
  }
  return deleted;
}

/**
 * Get total storage size used by offline queue (approximate)
 */
export async function getStorageSize(): Promise<number> {
  const db = await getDB();
  const recordings = await db.getAll('recordings');
  const images = await db.getAll('images');
  
  let totalSize = 0;
  for (const r of recordings) {
    totalSize += r.audio_blob?.size || 0;
  }
  for (const i of images) {
    totalSize += i.image_blob?.size || 0;
  }
  return totalSize;
}

/**
 * Check if storage limit is exceeded (200MB)
 */
export async function isStorageLimitExceeded(): Promise<boolean> {
  const size = await getStorageSize();
  return size > 200 * 1024 * 1024; // 200MB
}

/**
 * Get all recordings for a specific apartment
 */
export async function getRecordingsByApartment(apartmentId: string): Promise<OfflineRecording[]> {
  const db = await getDB();
  return db.getAllFromIndex('recordings', 'apartment_id', apartmentId);
}

/**
 * Get all images for a specific apartment
 */
export async function getImagesByApartment(apartmentId: string): Promise<OfflineImage[]> {
  const db = await getDB();
  return db.getAllFromIndex('images', 'apartment_id', apartmentId);
}

/**
 * Retry failed recordings (reset status to pending)
 */
export async function retryFailedRecordings(): Promise<number> {
  const db = await getDB();
  const failed = await db.getAllFromIndex('recordings', 'status', 'failed');
  for (const recording of failed) {
    await db.put('recordings', {
      ...recording,
      status: 'pending',
      attempts: 0,
      last_error: null,
    });
  }
  return failed.length;
}

/**
 * Retry failed images (reset status to pending)
 */
export async function retryFailedImages(): Promise<number> {
  const db = await getDB();
  const failed = await db.getAllFromIndex('images', 'status', 'failed');
  for (const image of failed) {
    await db.put('images', {
      ...image,
      status: 'pending',
      attempts: 0,
      last_error: null,
    });
  }
  return failed.length;
}
