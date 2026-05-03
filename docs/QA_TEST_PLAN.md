# Furniture Collect — QA Test Plan

**Version:** 1.0  
**Date:** May 3, 2026  
**Scope:** Full PRD coverage + 6 Mandatory UX Improvements

---

## Test Categories

1. **User Side Tests** — Field worker functionality
2. **Manager Side Tests** — Reports and management
3. **Full Flow Tests** — End-to-end scenarios
4. **Edge Cases** — Error handling and limits

---

## 1. USER SIDE TESTS

### 1.1 Multi-Photo Capture Flow

| Test ID | Test Case | Steps | Expected Result |
|---------|-----------|-------|-----------------|
| MP-001 | Start multi-photo mode | 1. Open apartment detail<br>2. Tap "רציף" button | Camera opens, multi-photo mode active |
| MP-002 | Capture first photo | 1. In multi-photo mode<br>2. Take photo<br>3. Wait for AI processing | Photo processed, dialog shows "צלם עוד" / "סיום" |
| MP-003 | Continue capturing | 1. After first photo<br>2. Tap "צלם עוד" | Camera opens again, counter increments |
| MP-004 | End capture session | 1. After capturing 3+ photos<br>2. Tap "סיום (3)" | Toast shows "3 תמונות נוספו בהצלחה", items appear in list |
| MP-005 | Cancel mid-session | 1. Start multi-photo<br>2. Close dialog without action | Session ends cleanly, captured items remain |
| MP-006 | Rapid photo capture | 1. Take 10 photos in quick succession | All photos processed, no duplicates, no crashes |

### 1.2 Swipe Actions

| Test ID | Test Case | Steps | Expected Result |
|---------|-----------|-------|-----------------|
| SW-001 | Swipe left to collect | 1. Find uncollected item<br>2. Swipe left | "נאסף" button revealed, item marked collected on tap |
| SW-002 | Swipe right to delete | 1. Find any item<br>2. Swipe right | "מחק" button revealed, delete confirmation on tap |
| SW-003 | Hard swipe delete | 1. Swipe right past 180px threshold | Item deleted immediately without confirmation |
| SW-004 | Undo collection | 1. Swipe left on collected item | "בטל איסוף" button revealed, status reverts on tap |
| SW-005 | Swipe disabled in bulk mode | 1. Enable bulk select<br>2. Try to swipe | Swipe gesture disabled, tap selects item instead |
| SW-006 | Vertical scroll with swipe | 1. Scroll list vertically<br>2. Attempt horizontal swipe | Both gestures work independently |

### 1.3 Voice Recording

| Test ID | Test Case | Steps | Expected Result |
|---------|-----------|-------|-----------------|
| VR-001 | Basic voice recording | 1. Tap mic button<br>2. Speak items in Hebrew<br>3. Tap stop | Items parsed and added to list |
| VR-002 | Voice with quantities | 1. Record "שלושה כיסאות" | Item added with quantity = 3 |
| VR-003 | Voice with location | 1. Record "שולחן בסלון" | Item added with location = "סלון" |
| VR-004 | Voice negation | 1. Record "מקרר לא לקחת" | Item added with intended_for_collection = false |
| VR-005 | Mic permission denied | 1. Deny mic permission<br>2. Tap record | Clear Hebrew error with instructions |
| VR-006 | Undo voice batch | 1. Record multiple items<br>2. Tap undo within 5s | All items from batch removed |

### 1.4 Photo Capture (Single)

| Test ID | Test Case | Steps | Expected Result |
|---------|-----------|-------|-----------------|
| PC-001 | Single photo capture | 1. Tap "צלם" button<br>2. Take photo | AI parses item, adds to list with photo |
| PC-002 | Low confidence warning | 1. Take blurry photo | Item added with "יש לאמת" badge |
| PC-003 | Room sweep | 1. Tap "חדר" button<br>2. Photo entire room | Multiple items detected, selection dialog shown |
| PC-004 | Room sweep selection | 1. In room sweep dialog<br>2. Uncheck some items<br>3. Tap add | Only selected items added |
| PC-005 | Attach photo to existing | 1. Tap camera icon on item row | Photo attached, thumbnail appears |

### 1.5 Offline Mode

| Test ID | Test Case | Steps | Expected Result |
|---------|-----------|-------|-----------------|
| OF-001 | Record while offline | 1. Enable airplane mode<br>2. Record voice items | Recording saved locally, badge shows pending |
| OF-002 | Photo while offline | 1. Enable airplane mode<br>2. Take photo | Photo saved locally, badge shows pending |
| OF-003 | Sync on reconnect | 1. Disable airplane mode | Pending items sync automatically |
| OF-004 | Sync progress | 1. Queue 5 recordings<br>2. Reconnect | Progress shown, items appear as synced |
| OF-005 | Failed sync retry | 1. Cause sync failure<br>2. Tap retry | Failed items re-queued and synced |
| OF-006 | Storage limit | 1. Queue 200MB+ of recordings | Error shown, new recordings blocked |

---

## 2. MANAGER SIDE TESTS

### 2.1 Statistics & Reports

| Test ID | Test Case | Steps | Expected Result |
|---------|-----------|-------|-----------------|
| ST-001 | View global statistics | 1. Navigate to Statistics page | All KPIs displayed correctly |
| ST-002 | Filter by project | 1. Select specific project | Stats update to show project only |
| ST-003 | Filter by category | 1. Select material category | Stats filtered by category |
| ST-004 | AI question | 1. Type "כמה CO2 נחסך?"<br>2. Submit | AI answers in Hebrew with data |
| ST-005 | Chart view toggle | 1. Switch between list/bar/pie | Charts render correctly, no overlap |

### 2.2 Export Features

| Test ID | Test Case | Steps | Expected Result |
|---------|-----------|-------|-----------------|
| EX-001 | CSV export | 1. Click CSV button | CSV file downloads with all items |
| EX-002 | Excel export | 1. Click Excel button | .xlsx file with 4 sheets (Items, Projects, Categories, Summary) |
| EX-003 | PDF export | 1. Click PDF button | Designed PDF with KPIs, charts, tables |
| EX-004 | Export with filters | 1. Apply filters<br>2. Export | Export contains only filtered data |
| EX-005 | Large dataset export | 1. Export 1000+ items | Export completes without timeout |
| EX-006 | Hebrew in exports | 1. Export items with Hebrew | Hebrew text renders correctly in all formats |

### 2.3 Sustainability Report

| Test ID | Test Case | Steps | Expected Result |
|---------|-----------|-------|-----------------|
| SR-001 | Generate report | 1. Navigate to project<br>2. Click "דוח קיימות" | Full-page report renders |
| SR-002 | Report content | 1. View report | Cover stats, material breakdown, per-apartment summary visible |
| SR-003 | Print/Save PDF | 1. Use browser print | Clean PDF output, JAS branding intact |

---

## 3. FULL FLOW TESTS

### 3.1 Complete Project Lifecycle

| Test ID | Test Case | Steps | Expected Result |
|---------|-----------|-------|-----------------|
| FL-001 | Create project | 1. Create new project with all fields | Project appears in list |
| FL-002 | Add apartments | 1. Add 3 apartments to project | Apartments appear grouped by building |
| FL-003 | Document items | 1. Use voice/photo/manual to add items | Items appear in apartment |
| FL-004 | Mark collected | 1. Swipe or toggle items as collected | Status updates, progress bars reflect |
| FL-005 | Complete apartment | 1. Collect all intended items | Apartment status changes to COMPLETED |
| FL-006 | Generate report | 1. View sustainability report | Report shows accurate totals |

### 3.2 Multi-User Scenario

| Test ID | Test Case | Steps | Expected Result |
|---------|-----------|-------|-----------------|
| MU-001 | Worker adds items | 1. Worker logs in<br>2. Adds items to apartment | Items visible to manager |
| MU-002 | Manager reviews | 1. Manager views same apartment | Sees worker's items with attribution |
| MU-003 | Concurrent editing | 1. Two users edit same apartment | No data loss, last write wins |
| MU-004 | Role restrictions | 1. Worker tries manager action | Action blocked appropriately |

---

## 4. EDGE CASES

### 4.1 Error Handling

| Test ID | Test Case | Steps | Expected Result |
|---------|-----------|-------|-----------------|
| EC-001 | Network timeout | 1. Simulate slow network<br>2. Submit action | Timeout error with retry option |
| EC-002 | Invalid image | 1. Upload non-image file | Clear error message in Hebrew |
| EC-003 | AI parse failure | 1. Submit unrecognizable audio | Graceful fallback, manual entry suggested |
| EC-004 | Session expired | 1. Let session expire<br>2. Try action | Redirect to login |
| EC-005 | Duplicate detection | 1. Add same item twice | Duplicate badge shown |

### 4.2 Performance & Limits

| Test ID | Test Case | Steps | Expected Result |
|---------|-----------|-------|-----------------|
| PF-001 | Large apartment | 1. Add 200+ items to apartment | Page loads in <3s, scrolling smooth |
| PF-002 | Many photos | 1. Attach photos to 50 items | Thumbnails load progressively |
| PF-003 | Rapid actions | 1. Quickly tap collect on 20 items | All updates succeed, no race conditions |
| PF-004 | Large audio file | 1. Record 5-minute audio | Processes successfully or shows limit error |

### 4.3 UI/UX Edge Cases

| Test ID | Test Case | Steps | Expected Result |
|---------|-----------|-------|-----------------|
| UX-001 | RTL layout | 1. Check all pages | Hebrew text aligned right, icons correct |
| UX-002 | Mobile responsive | 1. View on phone | All elements accessible, no horizontal scroll |
| UX-003 | Sticky bar scroll | 1. Scroll long item list | Bottom bar stays fixed, doesn't block content |
| UX-004 | Empty states | 1. View empty apartment | Helpful empty state with action buttons |
| UX-005 | Loading states | 1. Observe data loading | Skeleton loaders shown, no flash of empty |

---

## 5. AI ASSISTANT TESTS

| Test ID | Test Case | Steps | Expected Result |
|---------|-----------|-------|-----------------|
| AI-001 | Open assistant | 1. Tap sparkle button | Drawer opens with welcome message |
| AI-002 | Free text query | 1. Type question in Hebrew | AI responds with relevant data |
| AI-003 | Context awareness | 1. Open on apartment page<br>2. Ask about items | AI knows current apartment context |
| AI-004 | No quick prompts | 1. Open assistant first time | Only free-text input, no suggestion buttons |
| AI-005 | Clear conversation | 1. Tap "שיחה חדשה" | Conversation cleared, welcome shown |

---

## Test Execution Checklist

### Pre-Deployment
- [ ] All critical tests (FL-*) pass
- [ ] All export tests (EX-*) pass
- [ ] Offline mode tests (OF-*) pass
- [ ] No console errors in production build

### Post-Deployment
- [ ] Smoke test on production URL
- [ ] Verify database migrations applied
- [ ] Check edge function deployments
- [ ] Monitor error logs for 24h

---

## Test Environment Requirements

- **Browsers:** Chrome (latest), Safari (iOS), Firefox
- **Devices:** iPhone 12+, Android (Chrome), Desktop
- **Network:** Test with 3G throttling for offline scenarios
- **Data:** Seed with 3 projects, 10 apartments, 100 items

---

*Document maintained by QA team. Update as features evolve.*
