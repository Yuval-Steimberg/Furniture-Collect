# Offline voice capture — feature spec

Workers document apartments in stairwells, basements, and buildings slated for
demolition. Signal is unreliable. Today, a dropped connection during
`parse-voice-items` silently loses the recording — that's a trust killer.

This spec adds offline-first capture: every recording is stored locally first,
then synced when online.

---

## 1. Client-side queue (IndexedDB)

### DB: `jas-evacuation`

Object store `recordings`:
```
{
  id: string,                  // uuid v4, client-generated
  apartment_id: string,
  project_id: string,
  user_id: string,
  audio_blob: Blob,            // webm/opus
  recorded_at: number,         // Date.now()
  status: 'pending' | 'syncing' | 'failed' | 'synced',
  attempts: number,
  last_error: string | null,
  transcription: string | null,
  parsed_items_count: number | null
}
```

Index on `status` so we can query "all pending".

---

## 2. Capture flow (changes to `ApartmentDetail.tsx`)

Replace the current inline flow (record → upload → insert) with:

```
1. User taps Mic → recording starts (as today)
2. User taps stop → MediaRecorder produces Blob
3. Write recording to IndexedDB with status='pending' — this is the ONLY
   commit that must succeed for the user to move on.
4. Toast: "הקלטה נשמרה (N ממתינות לסנכרון)"  if N > 0
5. Kick the sync worker (see below)
```

The user's perceived latency drops to zero: recordings save instantly, parsing
happens in the background.

---

## 3. Sync worker

A single in-memory queue processor in the app, plus a Service Worker for true
offline/background sync on supported browsers.

### In-app worker (always present)
```
on network online OR app visible OR new recording saved:
  for each recording where status='pending' order by recorded_at:
    mark status='syncing'
    call parse-voice-items edge function with audio_base64
    on success:
      insert parsed items (as today)
      mark status='synced', store transcription + count
    on failure:
      increment attempts, store last_error
      if attempts < 5: mark status='pending' with exponential backoff
      else: mark status='failed'
```

### Service Worker (for closed-app sync)
Register a background sync event `sync-recordings`. When the OS fires it, the
worker flushes the queue the same way.

Browsers that don't support Background Sync (iOS Safari) still work fine — they
just sync when the app is reopened or visibility changes.

---

## 4. UI affordances

### Status badge in header
- Green sage pill "✓ מסונכרן" when queue is empty.
- Amber pill "N ממתין" when pending > 0.
- Red pill "N נכשל" when any status='failed'.
- Tap the pill → opens a sheet listing pending/failed items with retry + delete
  buttons.

### Mic button state
When recording while offline, show a subtle cloud-off icon next to the Mic icon.
Recording works identically; sync is deferred.

### Per-recording confirmation
Remove the auto-insert pattern for offline recordings and keep it for online.
Rationale: offline recordings accumulate; surprising item insertions when
syncing 8 queued recordings is jarring. Instead, when syncing offline items
show a single toast: "מסנכרן N הקלטות… [צפייה]".

---

## 5. Data integrity rules

- **Idempotency:** the client-generated `id` becomes the idempotency key for the
  edge function. If the function is called twice with the same id (retry), it
  must detect and return the cached result rather than re-inserting items.
  Simplest: use `(user_id, recording_id)` as a unique constraint on a new
  `processed_recordings` table.
- **Expiration:** recordings synced successfully are kept in IndexedDB for 7 days
  then purged. Failed recordings are never auto-purged — user must dismiss.
- **Size cap:** if IndexedDB total exceeds 200MB, block new recordings with a
  clear error ("ניתן לסנכרן את ההקלטות הקיימות לפני שיוקלטו חדשות").

---

## 6. Failure modes to handle

| Scenario | Behavior |
|---|---|
| Offline entire shift (2h, 30 recordings) | All queued locally. Sync on reconnect. Toast with progress. |
| Partial upload interrupted | MediaRecorder saves to blob atomically on stop. No partials. |
| User signs out with pending queue | Block sign-out with modal "N recordings pending, sync now?" |
| App crashes mid-record | MediaRecorder.stop fires on page unload? Not reliable — document as known limitation. |
| Audio too large (>25MB) | OpenAI Whisper limit. Compress before enqueue if needed, or split. |
| Edge function returns 429 | Honor Retry-After header, back off aggressively. |

---

## 7. Image capture should use the same queue

Once `camera-vision-autofill.md` ships, route its uploads through the same
IndexedDB queue (new store `images`). Same status model, same sync worker,
same badge.

---

## 8. Minimal implementation plan

1. Add `idb` npm package (lightweight IndexedDB wrapper).
2. Create `src/lib/offlineQueue.ts` with open/add/getPending/markSyncing/etc.
3. Wrap existing `processAudio` in `ApartmentDetail.tsx` with save-to-queue
   first, then in-memory sync.
4. Add a `useNetworkStatus` hook + a `OfflineBadge` component in the header.
5. Register a service worker from `main.tsx` that handles `sync-recordings`.
6. Add `processed_recordings` table + unique constraint + check in
   `parse-voice-items`.
7. Test: airplane mode → record 5 items → turn on → verify all sync.

This is 1–2 days of careful work. Low flash, high trust. Workers will feel the
difference instantly.
