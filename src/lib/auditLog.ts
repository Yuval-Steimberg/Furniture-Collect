/**
 * Client-side audit log stored in IndexedDB using idb
 * Separate DB from offlineQueue to avoid conflicts
 */

import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'jas-audit';
const DB_VERSION = 1;

export type AuditAction =
  | 'item_created' | 'item_collected' | 'item_uncollected' | 'item_deleted'
  | 'apartment_status_changed' | 'project_created';

export interface AuditEntry {
  id: string;                // crypto.randomUUID()
  action: AuditAction;
  entity_type: 'item' | 'apartment' | 'project';
  entity_id: string;
  entity_label: string;      // human-readable name (item description, apt number, etc.)
  project_id: string | null;
  apartment_id: string | null;
  actor_name: string;        // profile name or 'Unknown'
  timestamp: number;         // Date.now()
  meta?: Record<string, unknown>; // extra context (e.g. new_status, old_status)
}

let dbPromise: Promise<IDBPDatabase> | null = null;

/**
 * Open the audit DB, creating store + indexes if needed
 */
async function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('audit_entries')) {
          const store = db.createObjectStore('audit_entries', { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp');
          store.createIndex('project_id', 'project_id');
          store.createIndex('action', 'action');
        }
      },
    });
  }
  return dbPromise;
}

/**
 * Append a new audit entry (auto-generates id and timestamp)
 */
export async function logAudit(entry: Omit<AuditEntry, 'id' | 'timestamp'>): Promise<void> {
  const db = await getDB();
  const full: AuditEntry = {
    ...entry,
    id: crypto.randomUUID(),
    timestamp: Date.now(),
  };
  await db.put('audit_entries', full);
}

/**
 * Return the most recent `limit` entries sorted by timestamp descending
 */
export async function getRecentAudit(limit = 50): Promise<AuditEntry[]> {
  const db = await getDB();
  const all = await db.getAll('audit_entries');
  all.sort((a, b) => b.timestamp - a.timestamp);
  return all.slice(0, limit);
}

/**
 * Return entries for a specific project, sorted by timestamp descending
 */
export async function getAuditByProject(projectId: string, limit = 100): Promise<AuditEntry[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex('audit_entries', 'project_id', projectId);
  all.sort((a, b) => b.timestamp - a.timestamp);
  return all.slice(0, limit);
}

/**
 * Delete entries older than `daysToKeep` days; returns the count deleted
 */
export async function clearOldAudit(daysToKeep = 30): Promise<number> {
  const db = await getDB();
  const cutoff = Date.now() - daysToKeep * 86_400_000;
  const all = await db.getAll('audit_entries');
  let deleted = 0;
  for (const entry of all) {
    if (entry.timestamp < cutoff) {
      await db.delete('audit_entries', entry.id);
      deleted++;
    }
  }
  return deleted;
}
