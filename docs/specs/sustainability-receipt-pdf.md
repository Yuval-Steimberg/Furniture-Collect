# Sustainability receipt PDF — feature spec

The artifact that sells. A developer or municipality pays JAS to evacuate an
apartment; this PDF is the proof-of-impact they hand to their ESG team, their
regulator, or their marketing. Without it, JAS is a moving company. With it,
JAS is an environmental service.

**Output:** signed, dated, branded PDF per project (or per apartment on demand).
Shows kg diverted from landfill, CO₂-eq avoided, material breakdown, per-apartment
summaries, worker attribution, optional photos.

---

## 1. The data — material → CO₂-eq mapping

These are the conversion factors you plug into the Statistics + PDF generation.
Values are **kg CO₂-eq avoided per kg of diverted material** (i.e., the emissions
saved by not producing a virgin replacement).

Source: UK DEFRA + EPA WARM factors, rounded for reporting purposes. Use these
as a starting point; Noa may want to commission more Israel-specific factors
later.

| material_category | kg CO₂-eq saved per kg diverted | Notes |
|---|---|---|
| wood | 1.8 | Solid wood furniture; OSB/MDF slightly lower |
| metal | 2.0 | Mild steel average; aluminum much higher (see below) |
| aluminum | 9.1 | Very high embedded energy — a small aluminum chair matters |
| glass | 0.6 | Relatively low |
| plastic | 2.5 | Average across common polymers |
| textile | 8.0 | Cotton/mixed textiles; fast fashion is worse |
| electrical | 4.5 | Mixed metals + plastic + embedded manufacturing |
| other | 1.5 | Conservative default |

Store this in a constant (DB or edge-function code):

```ts
export const CO2_FACTORS_KG_PER_KG = {
  wood: 1.8, metal: 2.0, aluminum: 9.1, glass: 0.6,
  plastic: 2.5, textile: 8.0, electrical: 4.5, other: 1.5,
} as const;
```

**Weight source of truth:** `items.estimated_weight_kg × items.quantity`. If
weight is null (pre-vision migration), fall back to per-category averages:

```ts
export const FALLBACK_WEIGHT_KG_BY_TYPE = {
  furniture: 25, appliance: 40, textile: 3, small_item: 2, other: 5,
} as const;
```

---

## 2. Edge function: `export-project-report`

```
POST /functions/v1/export-project-report
Authorization: Bearer <supabase jwt>

Body:
{
  "project_id": "<uuid>",
  "scope": "project" | "apartment",
  "apartment_id": "<uuid>",        // required if scope == "apartment"
  "include_photos": true,
  "language": "he" | "en"          // default "he"
}

200 Response:
{
  "pdf_url": "<signed URL, 7-day expiry>",
  "report_id": "<uuid>",
  "summary": {
    "total_kg_diverted": 1230.5,
    "total_co2_saved_kg": 3180.2,
    "apartment_count": 12,
    "item_count": 340
  }
}
```

The response also inserts a row into a new `reports` table for audit:

```sql
CREATE TABLE public.reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  apartment_id UUID REFERENCES public.apartments(id) ON DELETE SET NULL,
  scope TEXT NOT NULL CHECK (scope IN ('project','apartment')),
  generated_by_user_id UUID NOT NULL REFERENCES public.profiles(id),
  pdf_storage_path TEXT NOT NULL,
  total_kg_diverted NUMERIC(12,2),
  total_co2_saved_kg NUMERIC(12,2),
  apartment_count INTEGER,
  item_count INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 3. PDF structure

### Page 1 — Cover
- JAS wordmark at top (forest on cream).
- Title: "דוח קיימות — [project name]" / "Sustainability Report — [project name]".
- Subheading: city, developer name, report date range.
- Hero number: **X טון הוצלו מהטמנה** ("X tons diverted from landfill"). Huge
  Heebo extrabold.
- Sub-hero: **Y טון CO₂ שווה-ערך נחסכו** ("Y tons CO₂-eq avoided").
- JAS stamp / official signature block at bottom-right.

### Page 2 — Material breakdown
- Horizontal bar chart, kg per material_category.
- Two columns: kg diverted, kg CO₂-eq saved.
- Visual: sage bars on cream, slate axis labels. No color beyond the JAS palette.

### Page 3 — Per-apartment summary table
- Building / apartment / item count / kg / CO₂-eq / worker names / status.
- Sage header row, cream body, subtle border.

### Page 4+ — Optional photo log (if include_photos=true)
- 2×3 grid per page. Each tile: photo, short description, apartment ref.
- Last 30 photos by default; configurable.

### Last page — Certification
- "אנו מאשרים כי הפריטים לעיל תועדו ופונו בהתאם ליעדי מיחזור ושימוש חוזר של Just A Second."
  English version for en.
- Signature block: prepared by, on behalf of JAS, date.
- Optional signed handover signature images from each apartment (if captured
  via feature 2.6).

---

## 4. Implementation options

### Option A — @react-pdf/renderer (inside the edge function)
Server-side React → PDF. Pros: fully styled, JAS fonts, easy to iterate.
Cons: larger bundle inside Deno edge function (needs check).

### Option B — Puppeteer / Playwright cloud service
Render an HTML report page (new route `/reports/:id` in the app) and snapshot
it to PDF via a service like Browserless.io. Pros: designers can style in
normal CSS. Cons: external dependency.

### Option C — html-to-pdf via pdf-lib + jsPDF
Lighter weight. Less design flexibility but no external service. Good enough
for v1.

**Recommendation:** start with **C** (pdf-lib). Move to A once the design
matures.

---

## 5. UI entry points

### Statistics page
Add a prominent button: **"הפק דוח קיימות"** / "Generate sustainability report"
(use `bg-primary` — and remove whatever currently holds the orange spot on this
screen so the one-orange rule holds).

Below the button, a table of previously-generated reports from the `reports`
table with download links.

### Project detail page
Three-dot menu → "Generate report for this project".

### Apartment detail page
Three-dot menu → "Generate report for this apartment".

---

## 6. Typography & brand in the PDF

- Body: Heebo 400, 11pt.
- Headings: Heebo 700, 18pt / 14pt / 12pt.
- Hero numbers: Heebo 900, 64pt.
- Colors: cream (#FFFCF5) background, forest (#333D36) text, sage (#B5C9AD)
  accent bars, orange (#E88225) only for the single most important number on
  page 1.
- Footer on every page: "Just A Second · ג׳אסט א סקונד · {project name}
  · {page}/{total}".

---

## 7. Validation before generating

- Refuse to generate if the project has zero apartments.
- Warn if any apartment has `status != COMPLETED` — the user may want to wait.
- Refuse to generate if > 50% of items have no weight (fallback averages only)
  unless the user confirms "yes, use estimates".

---

## 8. What this unlocks

Once this PDF exists:
- JAS can deliver a sample report to any Israeli pinui-binui developer.
- Municipalities can reference it in their ESG reporting.
- Prospective customers can see the exact artifact they'd receive.
- The per-apartment pricing model becomes concrete: "₪X per apartment, this
  report is what you get."

This is the feature that turns the app into a business.
