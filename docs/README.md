# Furniture app — JAS alignment & next-level roadmap

This folder is the **handoff package** for bringing the Lovable furniture-evacuation
app in line with the Just A Second brand and taking it from internal tool → sellable
product.

The furniture app lives in a separate repo (Lovable project `467e1a17-…`) and is
not part of this Website repo. Everything here is designed to be pasted into Lovable
as prompts, or applied by hand in a local checkout.

## Contents

| File | Purpose | How to use |
|---|---|---|
| `index.css.jas` | Drop-in replacement for the app's `src/index.css`. Contains all JAS tokens, translated to HSL for Tailwind v3 shadcn-style consumption. | Copy the whole file contents into `src/index.css` in the furniture-app repo. |
| `tailwind.config.patch.md` | Minimal patch instructions for `tailwind.config.ts`: adds `font-display` (Bowlby), updates sans to Heebo, keeps existing shadcn color mapping. | Apply the diff by hand or paste into Lovable as an edit prompt. |
| `MIGRATION.md` | Page-by-page, line-level class replacements for the 12 `src/pages/*.tsx` files. | Work top-to-bottom. Each section is a copy-paste prompt for Lovable. |
| `TRACKING.md` | Ordered punch-list — tier 1 (ship next), tier 2 (differentiators), tier 3 (scale). Checkboxes. | Living document; update as things land. |
| `specs/camera-vision-autofill.md` | Full spec for the photo → vision → structured-item pipeline. Edge function contract, prompt, JSON schema, UI flow. | Paste into Lovable as one feature brief. |
| `specs/sustainability-receipt-pdf.md` | Spec for the per-project sustainability PDF export (kg diverted, CO₂-eq, material breakdown). | Second Lovable feature brief. |
| `specs/offline-voice-capture.md` | Spec for offline-first voice recording queue (IndexedDB + service worker + sync). | Third Lovable feature brief. |
| `specs/batch-review-undo.md` | Spec for the 2-second undo flyout after auto-inserted voice items. | Quick win, paste as a fourth brief. |

## Recommended order

1. **Apply the design-system migration first** (`index.css.jas` +
   `tailwind.config.patch.md` + `MIGRATION.md`). This is non-functional work but it
   makes every subsequent screenshot sellable.
2. **Fix the one-character bug** in `ApartmentDetail.tsx:425` (see MIGRATION.md).
3. **Ship `camera-vision-autofill`** — this is the single feature that changes the
   product's character.
4. **Ship `sustainability-receipt-pdf`** — this is the artifact a customer pays for.
5. Work through `TRACKING.md` tier 2 as time allows.

## Why this is in the Website repo

Because you're here now, and the JAS design tokens you're porting live in this repo's
`src/index.css`. When the furniture app is cloned into its own directory,
this folder can be moved or mirrored. For now it's the most accurate place for it.
