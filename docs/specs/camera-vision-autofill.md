# Camera + vision-autofill — feature spec

The killer feature. Worker points phone at a couch → taps shutter → item appears
pre-filled in the list (description, type, material, estimated weight, condition).
User confirms or edits. Drops a 30-second voice description to a 2-second tap.

This builds on the app's existing pattern: voice → Whisper → Gemini 2.5 Flash
Lite → structured item. Same shape, different input (image instead of audio).

---

## 1. Storage setup (one-time, Supabase dashboard)

### Bucket
- Name: `item-photos`
- Public: **no** (use signed URLs)
- File size limit: 10 MB
- Allowed MIME types: `image/jpeg, image/png, image/webp`

### RLS policies on `storage.objects` for this bucket
- SELECT: user is a member of the project that owns the apartment that owns the item.
- INSERT: user is a member of the project (WORKER + PROJECT_MANAGER + ORG_ADMIN).
- DELETE: PROJECT_MANAGER + ORG_ADMIN only.

Path convention: `item-photos/{project_id}/{apartment_id}/{item_id}.jpg`

---

## 2. Schema additions

```sql
ALTER TABLE public.items
  ADD COLUMN condition TEXT CHECK (condition IN ('as_new', 'good', 'needs_repair', 'scrap_only')),
  ADD COLUMN ai_confidence NUMERIC(3,2),  -- 0.00 to 1.00, nullable for manual items
  ADD COLUMN source TEXT CHECK (source IN ('voice', 'text', 'image', 'manual')) DEFAULT 'manual';
```

Backfill `source='voice'` for items created via parse-voice-items (if you want
analytics), otherwise leave null.

---

## 3. Edge function: `parse-image-item`

```
POST /functions/v1/parse-image-item
Authorization: Bearer <supabase jwt>
Content-Type: application/json

Body:
{
  "image_base64": "<jpeg bytes, base64>",
  "apartment_id": "<uuid>",        // used to resolve project_id + scope
  "hint": "string"                  // optional user-provided context
}

200 Response:
{
  "item": {
    "description": "ספה תלת-מושבית, בד אפור",
    "quantity": 1,
    "location": "סלון",
    "intended_for_collection": true,
    "item_type": "furniture",
    "material_category": "textile",
    "estimated_weight_kg": 45,
    "condition": "good",
    "ai_confidence": 0.86,
    "detected_labels": ["sofa", "fabric", "upholstery"]
  },
  "processing_time_ms": 1820
}
```

On low confidence (`ai_confidence < 0.6`) the client should still insert the item
but mark it visually (e.g. a dotted border) and nudge the user to review.

### Model choice

Use **Claude Sonnet 4.5** (preferred, best Hebrew JSON output) or
**GPT-4.1 / GPT-4o** via the existing Lovable AI Gateway. Do **not** use
Gemini 2.5 Flash Lite here — it's fine for text parsing but weaker on vision
grounding for this use case.

Gateway call shape stays the same as `parse-voice-items/index.ts`:
```
fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
  method: 'POST',
  headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, ... },
  body: JSON.stringify({
    model: 'anthropic/claude-sonnet-4.5',  // or 'openai/gpt-4.1'
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: PROMPT },
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image_base64}` } }
      ]
    }],
    response_format: { type: 'json_schema', json_schema: SCHEMA }
  })
})
```

### Prompt (use this verbatim)

```
You are an inventory expert for a Hebrew-speaking apartment-evacuation and
furniture-reuse organization (Just A Second).

Given the photo of a single household item, return a JSON object matching the
provided schema. Rules:

1. description: short Hebrew phrase describing the item. Include primary
   material and color if clearly visible. Example: "ספה תלת-מושבית, בד אפור".
2. quantity: 1 unless the photo clearly shows multiple identical items.
3. location: infer from background (סלון, מטבח, חדר שינה, מרפסת) — empty string
   if unclear.
4. intended_for_collection: true for items in recoverable condition; false if
   severely broken or unsafe.
5. item_type: one of furniture / appliance / textile / small_item / other.
6. material_category: one of glass / aluminum / wood / plastic / metal /
   textile / electrical / other. Pick the dominant material.
7. estimated_weight_kg: a whole number. Use known averages for the object class:
   couch ~45, dining chair ~6, mattress ~25, refrigerator ~70, desk lamp ~2,
   dining table ~35, wardrobe ~50. Round sensibly.
8. condition: as_new / good / needs_repair / scrap_only based on visible wear,
   damage, stains, structural issues.
9. ai_confidence: your own confidence that the description is correct, 0.0–1.0.
10. detected_labels: an English list of 3–5 object/material labels you used.

Return ONLY JSON matching the schema, no commentary.
```

### JSON schema

```json
{
  "name": "item_extraction",
  "strict": true,
  "schema": {
    "type": "object",
    "properties": {
      "description": { "type": "string" },
      "quantity": { "type": "integer", "minimum": 1 },
      "location": { "type": "string" },
      "intended_for_collection": { "type": "boolean" },
      "item_type": { "type": "string", "enum": ["furniture","appliance","textile","small_item","other"] },
      "material_category": { "type": "string", "enum": ["glass","aluminum","wood","plastic","metal","textile","electrical","other"] },
      "estimated_weight_kg": { "type": "number", "minimum": 0 },
      "condition": { "type": "string", "enum": ["as_new","good","needs_repair","scrap_only"] },
      "ai_confidence": { "type": "number", "minimum": 0, "maximum": 1 },
      "detected_labels": { "type": "array", "items": { "type": "string" } }
    },
    "required": ["description","quantity","location","intended_for_collection","item_type","material_category","estimated_weight_kg","condition","ai_confidence","detected_labels"],
    "additionalProperties": false
  }
}
```

---

## 4. Client flow in `ApartmentDetail.tsx`

Add a new "Scan item" button next to the existing Mic + Manual buttons at the
bottom:

```
┌──────────────────────────────────────────┐
│  🎤 הקלט פריטים     📷 צלם פריט     +    │
│  (primary CTA)     (secondary)     (manual)│
└──────────────────────────────────────────┘
```

Orange stays on the Mic only. The camera button is `variant="outline"` in sage.

### Button handler

1. Open camera via `<input type="file" accept="image/*" capture="environment">`
   (appended once, triggered programmatically).
2. On file selected → compress to 1600px longest-side JPEG @ q=0.8 using
   `canvas.toBlob` (keeps under 300KB typical).
3. Upload to Supabase Storage under
   `item-photos/{project_id}/{apartment_id}/_pending_{uuid}.jpg`.
4. Insert a skeleton row into `items` with `source='image'` and `image_url` =
   signed URL to the pending file.
5. Call `parse-image-item` edge function with image_base64.
6. On response, UPDATE the skeleton item with the returned fields.
7. Rename the storage file from `_pending_{uuid}.jpg` → `{item.id}.jpg`.
8. If confidence < 0.6, open the edit dialog automatically so the user reviews.

### Offline fallback

If navigator.onLine === false, queue the image locally (see
`offline-voice-capture.md` — same IndexedDB pattern) and sync when reconnected.

---

## 5. UI polish

- Show `ai_confidence` as a small meter (sage-3 fill) next to AI-sourced items.
- If `detected_labels` array is non-empty, show them as tiny sage chips under
  the item description, only on the edit dialog.
- Add a per-session counter: "X פריטים נסרקו היום" in the header as social proof.

---

## 6. Cost & perf budget

- Expected payload: ~250KB JPEG base64 = 340KB JSON body.
- Claude Sonnet 4.5: ~$0.015 per call (input image + ~200 output tokens).
- Target latency end-to-end: < 3s. Whisper took ~2s in the existing voice
  pipeline — image should be similar.
- Budget tracking: log `processing_time_ms` and token usage from the response
  into a `ai_calls` table if you want to show cost per project.

---

## 7. Security

- Edge function must verify the calling user has access to the `apartment_id`
  (RLS check). Reject otherwise.
- Image base64 must not exceed 10MB; reject larger payloads before calling the
  AI gateway.
- Never log the image or the full response in production — strip before logging.
