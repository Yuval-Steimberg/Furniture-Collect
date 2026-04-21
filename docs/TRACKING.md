# Furniture app — next-level roadmap

Living punch-list. Update as things land. Organized by impact × effort — top
tiers first.

---

## Tier 0 — design-system migration (do this first)

- [ ] Drop `index.css.jas` into `src/index.css`
- [ ] Apply font change from `tailwind.config.patch.md`
- [ ] Remove old Google Fonts imports from `index.html` if present
- [ ] Work through `MIGRATION.md` sections 1–10
- [ ] Verify `index.html` has `dir="rtl"`
- [ ] Post-migration sanity: max one orange element per rendered screen
- [ ] Fix `ApartmentDetail.tsx:425` stray `(2)` label bug

**Exit criteria:** screenshots look like JAS brand.

---

## Tier 1 — product essentials (ship next)

These turn the app from "field tool" into "demo-able product."

### 1.1 Camera + photo capture on items
- [x] Wire capture UI in `ApartmentDetail.tsx` via hidden `<input type="file" accept="image/*" capture="environment">`
- [x] Upload to Supabase Storage bucket `item-photos/{project_id}/{apartment_id}/{uuid}.jpg`
- [x] Persist public URL into `items.image_url`
- [x] Show thumbnail inline on the item card, tap to open full-size
- [x] RLS policies on `item-photos` storage bucket (project-member read/upload, manager+admin delete)
- [ ] Later: attach a photo to an *existing* item (current flow creates a new item per photo)

### 1.2 Vision-autofill: photo → structured item ⭐️ *killer feature — shipped*
- [x] New edge function `parse-image-item` (Claude Sonnet 4.5 via Lovable AI Gateway)
- [x] New "צלם" button on `ApartmentDetail` bottom bar (ImagePlus icon, outline variant)
- [x] One-tap UX: camera → compress → vision → auto-insert pre-filled item
- [x] AI badge + low-confidence badge on items with `source='image'` and `ai_confidence < 0.6`
- [x] Defensive normalisation in the edge function — enum coercion, weight fallback, confidence clamp
- [ ] **Activation prerequisites (you must do these before the feature works):**
   - Apply the new migration `20260421000000_camera_vision_autofill.sql` in Supabase
   - Deploy the function: `supabase functions deploy parse-image-item`
   - Set `LOVABLE_API_KEY` in Supabase → Project Settings → Edge Functions → Secrets
- [ ] Polish later: fallback edit dialog if vision fails (currently we toast + abort)

### 1.3 Sustainability receipt PDF
- [ ] Material → weight → CO₂-eq mapping table (spec: `specs/sustainability-receipt-pdf.md`)
- [ ] `export-project-report` edge function returns PDF
- [ ] Button on Statistics page: "הפק דוח קיימות" (Generate sustainability report)
- [ ] PDF content: cover, per-apartment summary, totals, signed timestamp
- [ ] Delivered as direct download, saved link into a `reports` table for history

### 1.4 Offline voice capture
- [ ] IndexedDB queue for recorded audio blobs (spec: `specs/offline-voice-capture.md`)
- [ ] Service worker to register background sync
- [ ] Visible "N recordings pending sync" badge when offline
- [ ] On reconnect, flush queue to `parse-voice-items` in sequence

### 1.5 Batch-review undo for voice input
- [ ] After auto-insert, show a 4-second flyout: "נוספו N פריטים [בטל]"
- [ ] Click undo → delete the N most recent items by current user in this apartment
- [ ] No confirmation dialog — trust the undo window (spec: `specs/batch-review-undo.md`)

---

## Tier 2 — differentiators (makes it a real product)

### 2.1 Collector scheduling
- [ ] Add `pickup_run_id` column to `items` (FK to new `pickup_runs` table)
- [ ] New page `/projects/:id/pickups` — drag items into daily runs per truck
- [ ] Worker view: "your route today" — ordered list of pickups with maps links

### 2.2 Condition grading
- [ ] Enum `condition`: `as_new | good | needs_repair | scrap_only`
- [ ] Field on item edit dialog
- [ ] Computed by vision-autofill as first pass (spec covers this)

### 2.3 Dual-language (Hebrew / English) UI
- [ ] i18n layer (e.g. `react-i18next`) wrapping every user-facing string
- [ ] Locale switcher in sidebar
- [ ] Reports generated in the active locale

### 2.4 QR code per apartment
- [ ] Generate QR in `ApartmentDetail.tsx` → points to `/projects/:pid/apartments/:aid`
- [ ] Print sheet: all QRs for a project, one per apartment
- [ ] Worker scans at entry to open the right apartment page instantly

### 2.5 Checklist templates by apartment type
- [ ] `apartment_templates` table: ordered list of probable items
- [ ] "3-room standard" / "4-room family" / "studio" presets
- [ ] On apartment create, seed items from template (intended_for_collection=false)

### 2.6 Signed handover
- [ ] Signature canvas at the bottom of ApartmentDetail when status=COMPLETED
- [ ] Stored as base64 in `apartments.handover_signature_url` (Supabase Storage)
- [ ] Appears on the sustainability-receipt PDF

### 2.7 Item "before" photos for damage disputes
- [ ] Column `items.before_image_url`
- [ ] Capture before moving; current `image_url` becomes "after"

---

## Tier 3 — scale features (once you have a second customer)

### 3.1 Org-level dashboard
- [ ] Separate ops view aggregating across all projects for an org
- [ ] Charts: apartments/week, kg diverted cumulative, top workers

### 3.2 Webhooks on apartment COMPLETED
- [ ] Org can register webhook URLs
- [ ] Fire on status change; delivered via `pg_net` or edge function

### 3.3 Audit log
- [ ] Generic `audit_log` table: entity, entity_id, action, actor, diff, timestamp
- [ ] Triggers on `items`, `apartments`, `projects`, `user_projects`
- [ ] Admin view in `/user-management`

### 3.4 Room-sweep vision (one photo → many items)
- [ ] Alternate endpoint of `parse-image-item` that returns a list
- [ ] UI: draw boxes over detected items, each box = one confirm tap

### 3.5 Weekly email digest per PM
- [ ] pg_cron job → edge function → Resend email
- [ ] Content: this week's stats for each project they manage

### 3.6 Demo route + seed data
- [ ] `/demo` seeds a fake project with 3 apartments, 40 items, 5 with photos
- [ ] Resets nightly
- [ ] Used for sales calls and Product Hunt-style marketing

---

## Commercial / sell-it layer (do in parallel with tier 1)

- [ ] Pick a positioning: פינוי-בינוי compliance vs upcycler toolkit vs waste-mgmt white-label
- [ ] Landing page (can live on the JAS Website as `/app` or a subdomain)
- [ ] Pricing model — per-apartment fee is natural: ₪X per documented apartment
- [ ] TOS + DPA — any developer's legal team will ask
- [ ] Reference customer: JAS itself is customer zero; document the story
- [ ] Case study PDF: "Project Y, N apartments, X tons diverted, CO₂ equivalent"

---

## Known bugs / polish

- [ ] `ApartmentDetail.tsx:425` — stray `(2)` in filter button label
- [ ] Camera icon toggles color but doesn't do anything (fixed by 1.1)
- [ ] No empty-state illustration when a project has zero apartments
- [ ] `parse-voice-items` has no retry — a 500 drops the recording silently (fixed by 1.4)
- [ ] `estimated_weight_kg` column exists but nothing ever writes to it (fixed by 1.2 + vision weight estimate)
