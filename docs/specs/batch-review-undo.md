# Batch-review undo — feature spec

The current `ApartmentDetail.tsx` auto-inserts parsed voice items with no
confirmation. That's the right call for speed — workers don't want to approve
10 items one by one — but it means a single misheard word becomes silent data
corruption.

Fix: keep the auto-insert behavior, but add a Gmail-style "item(s) added · undo"
flyout for 4–6 seconds after every insert. One tap reverts everything that just
happened.

---

## 1. UX

After `addParsedItemsDirectly` (or the manual-text equivalent) returns success:

```
┌──────────────────────────────────────────┐
│  ✓ 5 פריטים נוספו          [בטל]  ✕    │
└──────────────────────────────────────────┘
  flyout appears at bottom, above the Mic button
  auto-dismisses after 5000ms
```

- Position: fixed, bottom: 96px (above the Mic button), centered.
- Width: min 280px, max 420px.
- Background: `bg-foreground text-background` (forest bar with cream text).
- Undo button: `variant="ghost"` in cream text, plus an undo icon.
- The `×` closes the flyout without undoing.

A follow-up recording during the 5-second window **does not dismiss** the
flyout — it shifts it up slightly and appends the new insert to the same undo
context ("9 פריטים נוספו"). Undo then reverts all 9.

---

## 2. State model

Keep an in-memory stack of the last batch's item IDs:

```ts
type PendingUndoBatch = {
  ids: string[];                 // items to delete on undo
  createdAt: number;
  expiresAt: number;
};

const [pendingUndo, setPendingUndo] = useState<PendingUndoBatch | null>(null);
```

On a new insert:
- If `pendingUndo` exists and `Date.now() < expiresAt`:
  - Extend the batch: append new ids, push `expiresAt` to `Date.now() + 5000`.
- Else: start a new batch.

On timer expiry: `setPendingUndo(null)`.

On user click "undo":
- Call `supabase.from('items').delete().in('id', pendingUndo.ids)`.
- Clear state. Show a quiet toast: "הפעולה בוטלה".
- Reload the items list.

---

## 3. Safety guards

- If any item in `pendingUndo.ids` has already been edited by another user
  (check `updated_at` >recording's time), skip that id and only delete the
  untouched ones. Toast: "N פריטים שוחזרו, M לא נמחקו (נערכו)".
- If any item has `collected=true`, skip it. Do not delete collected items
  even during undo window — that's data the worker or a collector has
  confirmed.
- Undo is not available to `WORKER` role if the item was created by someone
  else (shouldn't happen in normal flow, but RLS enforces this anyway).

---

## 4. Hard delete vs soft delete

For the undo window, use hard delete (simpler, current schema). Items deleted
within 5 seconds of creation have effectively never existed.

Later, if the audit-log feature (tracking.md §3.3) ships, switch to soft delete
via an `items.deleted_at` column so audits catch deletions.

---

## 5. Keyboard shortcut

Desktop: `Cmd/Ctrl+Z` while the flyout is visible triggers undo. Small
quality-of-life win for office-based project managers doing text-mode entry.

---

## 6. Implementation footprint

- New file: `src/components/UndoFlyout.tsx` — the visual component.
- New hook: `src/hooks/use-undo-stack.ts` — the batch state + timer.
- Wire into `addParsedItemsDirectly` and `addManualItem` in
  `ApartmentDetail.tsx`: after successful insert, `pushToUndoStack(newItemIds)`.
- Total: ~120 lines. Half-day of work. Huge perceived trust improvement.
