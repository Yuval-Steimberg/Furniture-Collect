# Furniture app — JAS migration checklist

**Before you start:**
1. Drop `index.css.jas` into `src/index.css` (complete replacement).
2. Apply the font change in `tailwind.config.patch.md`.
3. Delete the old Google Fonts imports if they linger in `index.html` (Roboto,
   Crimson Pro, SF Mono) — they're replaced by Heebo + Bowlby One SC inside
   the new `index.css`.

After that, the app will already look dramatically more JAS-correct (cream bg,
orange CTA, sage/forest accents), because every `bg-primary` / `text-muted-foreground`
class automatically inherits the new token values.

**But** there's still a problem: the app uses `bg-primary` (now orange) for every
page header. That's 7+ orange bars on screen at once, which violates the "one
orange element per screen" rule hard. This checklist fixes that plus other
JAS-specific polish.

Work through sections **in order**. Each ✅-gated block is one Lovable prompt.

---

## ✅ 1. The universal fix: page headers → forest, not orange

**Problem:** 7 files currently render a `<header className="bg-primary text-primary-foreground">` bar. With JAS tokens applied, that's 7 orange bars — our orange is now a *punctuation mark*, not a field color. The header should be forest (`bg-sidebar`) with cream text, matching the JAS guideline's "forest panels" pattern.

**Files affected:**
- `src/pages/Projects.tsx:409`
- `src/pages/ProjectDetail.tsx:169`
- `src/pages/ApartmentDetail.tsx:396`
- `src/pages/NewProject.tsx:46`
- `src/pages/NewApartment.tsx:52`
- `src/pages/Statistics.tsx:150`
- `src/pages/ProjectUsers.tsx:213`

**Lovable prompt:**

> Across all 7 files listed below, replace the header element's class list.
> The pattern to find (appears near the top of each file) is a `<header>` with
> classes `bg-primary text-primary-foreground shadow-lg ...`.
>
> Replace `bg-primary text-primary-foreground` with `bg-sidebar text-sidebar-foreground`
> on each `<header>` and on the `<Button variant="ghost">` children inside it
> (the back-arrow button hover classes should change from
> `hover:bg-primary-foreground/20` to `hover:bg-sidebar-accent`).
>
> Files: `src/pages/Projects.tsx`, `src/pages/ProjectDetail.tsx`,
> `src/pages/ApartmentDetail.tsx`, `src/pages/NewProject.tsx`,
> `src/pages/NewApartment.tsx`, `src/pages/Statistics.tsx`,
> `src/pages/ProjectUsers.tsx`.
>
> Leave the Mic/Record button in `ApartmentDetail.tsx` exactly as it is — that is
> the one allowed orange element on that screen.

---

## ✅ 2. Avatar circles and badges that were `bg-primary`

**Problem:** Several screens render a small circular avatar or role badge with
`bg-primary` — same issue, it's now orange.

**Fixes:**

| File | Line | Change |
|---|---|---|
| `src/pages/ProjectUsers.tsx` | ~200 | `<Badge className="bg-primary">מנהל פרויקט</Badge>` → `<Badge className="bg-accent text-accent-foreground">מנהל פרויקט</Badge>` (sage, calm) |
| `src/pages/ProjectUsers.tsx` | ~247 | `rounded-full bg-primary/20` → `rounded-full bg-accent` |
| `src/pages/UserManagement.tsx` | ~253 | same badge change as ProjectUsers:200 |
| `src/pages/UserManagement.tsx` | ~314 | same avatar circle change as ProjectUsers:247 |
| `src/pages/Projects.tsx` | ~413 | `rounded-full bg-primary-foreground/20` → `rounded-full bg-sidebar-accent` (it's inside the new forest header) |
| `src/pages/Auth.tsx` | ~85 | The big `rounded-full bg-primary flex items-center justify-center` centerpiece on the login page: keep as `bg-primary` — this *is* the one orange element on the Auth screen, that's fine. |
| `src/pages/GlobalStatistics.tsx` | ~461 | `bg-primary/10 text-primary` → `bg-secondary text-secondary-foreground` (sage pill instead of orange pill) |

**Lovable prompt:**

> Apply the above table of class-list changes. Do not change
> `src/pages/Auth.tsx:85` — the large orange circle on the Auth page is
> intentionally the one orange element on that screen.

---

## ✅ 3. Progress bars — project completion bar in Projects.tsx

**File:** `src/pages/Projects.tsx:287,304`

Currently: collected bar is `bg-success` (now sage-3 green — fine), inner bar is
`bg-primary` (orange — not fine; duplicates CTA).

**Change line ~304:**
`className="h-full bg-primary transition-all"` → `className="h-full bg-accent transition-all"`

Leave line ~287 (`bg-success`) as is — the success token maps to sage-3, which is
JAS-correct.

---

## ✅ 4. Stray label bug in `ApartmentDetail.tsx:425`

Currently the button label reads:

```tsx
רק תיעוד (2){items.filter(i => !i.intended_for_collection).length})
```

The `(2)` is a leftover hardcoded placeholder; there's also a stray unclosed
paren, which is why the rendered output looks broken.

**Change to:**

```tsx
רק תיעוד ({items.filter(i => !i.intended_for_collection).length})
```

Single clean dynamic count, no hardcoded `(2)`, paren balanced.

---

## ✅ 5. Statistics page — sustainability section

**File:** `src/pages/Statistics.tsx`

The AI-stats block (`co2_saved_kg`) is using `text-success` (sage-3) which is OK,
but the card backgrounds fall back to white. Push this to cream for the paper
feel:

- Any `bg-white` or `bg-card` on the AI stats panel → keep (card tokens already
  resolve to white for small cards, which is allowed).
- Any `bg-muted` wrappers that hold the overall page → fine, resolves to cream-3.

**Nothing to change here once the tokens are migrated.** Just verify after the
token swap that nothing reads as grey.

---

## ✅ 6. Global typography — "text-2xl md:text-3xl font-bold" headlines

The app uses a lot of `font-bold`. Heebo at weight 700+ looks good in Hebrew.
Leave these alone. Do **not** change any `font-bold` or `font-semibold` classes.

What you **can** optionally do once tokens are migrated: take a single hero
on `Projects.tsx` (the "ניהול פרויקטים" title if any) and experiment with
`font-extrabold` for stronger JAS H2 feel. Totally optional.

---

## ✅ 7. Sidebar (if `AppSidebar.tsx` renders one)

**File:** `src/components/AppSidebar.tsx`

The sidebar token mapping in `index.css.jas` already resolves the sidebar to
forest-on-cream by default. Spot-check the active nav item — if it currently uses
`bg-sidebar-primary` that will make it orange, which is fine as long as only one
nav item is active (matches the "one orange punctuation mark" rule in the nav
context).

If you don't like the orange active nav, change the active state from
`bg-sidebar-primary` → `bg-sidebar-accent` and you'll get a lighter-forest active
state, which is the quieter option.

---

## ✅ 8. Toast / Sonner component

`src/components/ui/sonner.tsx` currently defaults the action button to
`bg-primary` (orange). Toasts are ephemeral; having orange in a toast that pops
over an already-orange CTA is visually noisy. Recommended tweak:

> In `src/components/ui/sonner.tsx`, change `actionButton` styles from
> `group-[.toast]:bg-primary group-[.toast]:text-primary-foreground`
> to
> `group-[.toast]:bg-foreground group-[.toast]:text-background`.

---

## ✅ 9. Loading spinners

Voice-processing spinner in `ApartmentDetail.tsx:498,610`:

```tsx
<div className="animate-spin rounded-full h-5 w-5 sm:h-6 sm:w-6 border-b-2 border-current">
```

`border-current` means it inherits from the Mic button (orange). That's fine —
it's inside the primary CTA, the one allowed orange element.

The manual-entry dialog spinner (`src/pages/ApartmentDetail.tsx:610`) uses
`border-primary` — change to `border-muted-foreground` (a slate spinner in a
dialog is calmer and doesn't fight the orange CTA underneath).

---

## ✅ 10. index.html — set dir="rtl"

Verify `index.html` has `<html lang="he" dir="rtl">`. If it's missing `dir="rtl"`,
the Hebrew layout flips are inconsistent. This is a one-line fix at the top of
`index.html`.

---

## Done — what you should see

After all 10 blocks:
- Page background: warm cream, not white/grey.
- Page headers: forest (`#333D36`) bar with cream text.
- Primary CTA (the Mic button on ApartmentDetail): orange, standing alone.
- Cards and surfaces: cream/sage with warm low-contrast shadows.
- Success states: a living sage-green, not a saturated Material green.
- Warning states: muted warm ochre, distinct from primary.
- Typography: Heebo everywhere, with optional Bowlby on rare Latin heroes.

If any screen still has two or more orange elements, note the file + element
and flag it — that's a rule violation. The principle: orange is a punctuation
mark.

---

## Post-migration verification prompts

Run these in Lovable to spot-check:

> Find every usage of `bg-primary` in `src/pages/**/*.tsx` and list them
> grouped by file. Flag any screen (file) where more than one `bg-primary`
> appears on the same rendered view. The one allowed exception is
> `ApartmentDetail.tsx` where the Mic button must stay orange.

> List every file in `src/pages` that uses `bg-white`. Report which ones can
> be changed to `bg-background` or `bg-card` without losing contrast.

These two searches will catch >90% of remaining JAS violations.
