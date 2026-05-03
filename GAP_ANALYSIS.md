# Furniture Collect — Full Gap Analysis & Implementation Plan

**Date:** May 3, 2026  
**Analysis Scope:** PRD Requirements + 6 Mandatory UX Improvements

---

## STEP 1: GAP ANALYSIS

### A. Core PRD Features

| Feature | Status | Notes |
|---------|--------|-------|
| Projects → Buildings → Apartments → Items hierarchy | ✅ Fully Implemented | DB schema supports full hierarchy |
| Photo capture (single item) | ✅ Fully Implemented | `parse-image-item` edge function |
| Room sweep (multi-item vision) | ✅ Fully Implemented | `parse-room-image` edge function |
| Voice recording → items | ✅ Fully Implemented | `parse-voice-items` edge function |
| Free-text → items | ✅ Fully Implemented | `parse-text-items` edge function |
| Guided walkthrough | ✅ Fully Implemented | `GuidedWalkthrough.tsx` component |
| AI Assistant | ✅ Fully Implemented | `AIAssistant.tsx` floating drawer |
| Resale value estimator | ✅ Fully Implemented | `estimate-resale-value` edge function |
| Duplicate detection | ✅ Fully Implemented | `check-duplicate-item` edge function |
| Smart search | ✅ Fully Implemented | `smart-search` edge function |
| Stats Q&A | ✅ Fully Implemented | `ask-statistics-question` edge function |
| Sustainability Report | ✅ Fully Implemented | `SustainabilityReport.tsx` page |
| User roles (ORG_ADMIN, PROJECT_MANAGER, WORKER) | ✅ Fully Implemented | RLS policies in place |
| Swipe-to-delete | ✅ Fully Implemented | `SwipeableRow.tsx` component |
| Bulk select mode | ✅ Fully Implemented | In `ApartmentDetail.tsx` |
| Photo lightbox | ✅ Fully Implemented | `Lightbox.tsx` component |
| Undo flyout | ✅ Fully Implemented | `UndoFlyout.tsx` component |

### B. 6 Mandatory UX Improvements (HIGH PRIORITY)

| # | Requirement | Status | Implementation Needed |
|---|-------------|--------|----------------------|
| 1 | **Multi-Photo Capture** (same apartment context) | ❌ Missing | Add "Continue capturing" mode after photo |
| 2 | **Remove Auto-Overlay on Images** | 🟡 Partial | No overlay found, but verify no metadata burned in |
| 3 | **Sticky Item-Addition Bar** | ✅ Implemented | Bottom bar is already `fixed` positioned |
| 4 | **Swipe Left = "Collected" (נאסף)** | ✅ Implemented | `SwipeableRow.tsx` already has this |
| 5 | **AI Assistant Simplification** | ❌ Missing | Remove `QUICK_PROMPTS` array, keep only free-text |
| 6 | **Statistics Page Improvements** | 🟡 Partial | Charts exist but need: fix overlap, add Excel/PDF export |

### C. PRD Features - Detailed Status

| Feature | Status | Gap Details |
|---------|--------|-------------|
| Voice input (optional layer) | ✅ Implemented | Works with Whisper |
| Offline mode (sync queue) | ❌ Missing | Spec exists but not implemented |
| Analytics engine | ✅ Implemented | `GlobalStatistics.tsx` + `calculate-statistics` |
| Sales module | ❌ Missing | No sales tracking table/UI |
| Public dashboard | ❌ Missing | No public-facing dashboard |
| CSV Export | ✅ Implemented | Basic CSV in `GlobalStatistics.tsx` |
| Excel Export (.xlsx) | ❌ Missing | Need proper Excel with multiple sheets |
| PDF Export (high quality) | ❌ Missing | Need designed PDF with charts/KPIs |

---

## STEP 2: NON-BREAKING IMPLEMENTATION PLAN

### Priority 1: 6 Mandatory UX Improvements

#### 1.1 Multi-Photo Capture Mode
**Files to modify:**
- `src/pages/ApartmentDetail.tsx` — Add state for multi-capture mode
- Add "Continue capturing" / "Done" buttons after photo capture

**New behavior:**
- After successful photo capture, show modal: "Add another photo" / "Done"
- Photos batch-associated with current apartment_id
- No re-entry of apartment details needed

#### 1.2 Remove Auto-Overlay (Verify)
**Files to check:**
- `src/pages/ApartmentDetail.tsx` — Image display logic
- No canvas overlay drawing found — **Already clean**

#### 1.3 Sticky Item-Addition Bar
**Status:** ✅ Already implemented at line 1165:
```tsx
<div className="fixed bottom-0 left-0 right-0 p-3 sm:p-4 bg-background border-t shadow-lg">
```

#### 1.4 Swipe Left = Collected
**Status:** ✅ Already implemented in `SwipeableRow.tsx`:
- Swipe left reveals "נאסף" (Collected) button
- Swipe right reveals "מחק" (Delete) button

#### 1.5 AI Assistant Simplification
**Files to modify:**
- `src/components/AIAssistant.tsx` — Remove `QUICK_PROMPTS` array and related UI

#### 1.6 Statistics Page Improvements
**Files to modify:**
- `src/pages/GlobalStatistics.tsx`

**New files to add:**
- `src/lib/exportUtils.ts` — Export utilities for CSV, Excel, PDF

**Dependencies to add:**
- `xlsx` — Excel generation
- `jspdf` + `jspdf-autotable` — PDF generation with tables
- `html2canvas` — Chart capture for PDF

---

### Priority 2: Missing PRD Features

#### 2.1 Offline Mode (Sync Queue)
**New files:**
- `src/lib/offlineQueue.ts` — IndexedDB queue management
- `src/hooks/useNetworkStatus.ts` — Network status hook
- `src/components/OfflineBadge.tsx` — Sync status indicator
- `public/sw.js` — Service worker for background sync

**Files to modify:**
- `src/pages/ApartmentDetail.tsx` — Integrate offline queue
- `src/main.tsx` — Register service worker

#### 2.2 Sales Module
**Database additions:**
- `sales` table with FK to items
- `sale_status` enum

**New files:**
- `src/pages/Sales.tsx` — Sales management page
- `supabase/migrations/YYYYMMDD_sales_module.sql`

#### 2.3 Public Dashboard
**New files:**
- `src/pages/PublicDashboard.tsx` — Read-only public stats view

---

## STEP 3: DATABASE VALIDATION

### Current Schema (Verified ✅)
```
profiles (id, name, org_role, created_at, updated_at)
projects (id, name, city, developer_name, start_date, ...)
user_projects (id, user_id, project_id, project_role, ...)
apartments (id, project_id, building_number, apartment_number, status, notes, ...)
items (id, project_id, apartment_id, description, quantity, location, 
       intended_for_collection, collected, item_type, material_category,
       estimated_weight_kg, image_url, condition, ai_confidence, source,
       estimated_resale_ils, duplicate_of, created_by_user_id, collected_by_user_id, ...)
```

### Required Extensions (Non-Breaking)

```sql
-- 1. Sales module table
CREATE TABLE public.sales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  sale_price NUMERIC(10, 2),
  sale_date DATE,
  buyer_info TEXT,
  notes TEXT,
  created_by_user_id UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Offline sync tracking
CREATE TABLE public.processed_recordings (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  recording_id TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  items_created INTEGER DEFAULT 0,
  UNIQUE(user_id, recording_id)
);

-- 3. Photo batches for multi-photo capture
CREATE TABLE public.photo_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  apartment_id UUID NOT NULL REFERENCES public.apartments(id) ON DELETE CASCADE,
  created_by_user_id UUID NOT NULL REFERENCES public.profiles(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  photo_count INTEGER DEFAULT 0
);
```

---

## STEP 4: IMPLEMENTATION SEQUENCE

### Phase 1: UX Improvements (Immediate)
1. ✅ Verify sticky bar (already done)
2. ✅ Verify swipe-left collected (already done)
3. Simplify AI Assistant (remove quick prompts)
4. Add multi-photo capture mode
5. Fix statistics charts + add exports

### Phase 2: Core Features
6. Implement offline mode with IndexedDB
7. Add Excel export with multiple sheets
8. Add PDF export with designed dashboard

### Phase 3: Extended Features
9. Sales module (DB + UI)
10. Public dashboard
11. Production hardening

---

## STEP 5: FILES TO CREATE/MODIFY

### New Files
| File | Purpose |
|------|---------|
| `src/lib/exportUtils.ts` | CSV, Excel, PDF export utilities |
| `src/lib/offlineQueue.ts` | IndexedDB offline queue |
| `src/hooks/useNetworkStatus.ts` | Network status detection |
| `src/components/OfflineBadge.tsx` | Sync status indicator |
| `src/pages/Sales.tsx` | Sales management |
| `src/pages/PublicDashboard.tsx` | Public stats view |
| `public/sw.js` | Service worker |
| `supabase/migrations/YYYYMMDD_sales_and_offline.sql` | DB extensions |

### Modified Files
| File | Changes |
|------|---------|
| `src/components/AIAssistant.tsx` | Remove QUICK_PROMPTS |
| `src/pages/ApartmentDetail.tsx` | Multi-photo mode, offline integration |
| `src/pages/GlobalStatistics.tsx` | Chart fixes, export buttons |
| `src/App.tsx` | New routes |
| `package.json` | New dependencies |

---

## STEP 6: QA TEST PLAN OUTLINE

See separate QA_TEST_PLAN.md for full test cases.

---

## STEP 7: FINAL CHECKLIST

- [ ] All 6 UX improvements implemented
- [ ] Multi-photo capture working
- [ ] AI Assistant simplified (free-text only)
- [ ] Statistics charts not overlapping
- [ ] CSV export working
- [ ] Excel export with multiple sheets
- [ ] PDF export with designed layout
- [ ] Offline mode functional
- [ ] No breaking changes to existing features
- [ ] All existing tests passing
