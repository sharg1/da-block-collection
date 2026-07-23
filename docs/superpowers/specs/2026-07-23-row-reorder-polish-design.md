# Row Reorder Polish — Design

## Problem

The Experiences grid in the MEP manifest tool already has row reordering wired up: the row-number cell (`.col-handle`) is `draggable`, and `dragstart`/`dragover`/`drop` handlers on the `<tr>` call `model.moveRow(fromIdx, toIdx)`, which correctly splices the row array. Row order is pure array position — it already round-trips through `model.toSheet()` and the DA save/upload flow with no schema changes needed.

The problem is discoverability and feedback, not data flow:

- The "handle" is a bare row number (`1`, `2`, `3`, …) with `cursor: grab` on hover — nothing signals it's draggable.
- The only feedback during a drag is a 2px top border on the row currently under the cursor, which doesn't distinguish "drop above this row" from "drop below this row."
- No visible cue on the row actually being dragged beyond a partial opacity fade.

Net effect: users don't discover the capability, and when they do use it, it's hard to tell exactly where a row will land before releasing.

## Scope

In scope:
- Visible drag handle (grip icon + row number) in `tools/mep-manifest/src/ui/experiences-tab.js`.
- Clear insertion-line feedback showing whether a drop will land above or below the hovered row, based on cursor position within that row.
- Cleaned-up drag-ghost/highlight styling, with reset on `dragend`/`drop`/`dragleave`, audited for edge cases (e.g. dragging out of the table entirely).
- Supporting CSS in `tools/mep-manifest/mep-manifest.css`.

Out of scope (explicitly deferred, not built as part of this change):
- Keyboard-based reordering (e.g. up/down buttons).
- Touch/mobile drag support (native HTML5 DnD doesn't support touch).
- Any change to the data model, `moveRow()`, `toSheet()`, or the DA save/upload path — order is already correctly array-position-based and already persists correctly.

## Design

### 1. Visible handle

Replace the handle `<td>` content (currently just `rowIdx + 1` as text) with a small flex row containing:
- A grip glyph (⠿) as the drag affordance.
- The row number, kept for reference.

CSS: keep `cursor: grab` on the handle, add `cursor: grabbing` while a drag is in progress (toggled via a class on the handle or row during `dragstart`/`dragend`).

### 2. Insertion-line indicator

Replace the current "top border on hovered row" approach with an explicit indicator element (a thin absolutely-positioned line) that:
- Appears above the hovered row if the cursor's Y position is in the top half of that row's bounding box.
- Appears below the hovered row if the cursor's Y position is in the bottom half.

Implementation: in the `dragover` handler (currently on `tr`), compute cursor position relative to the row's `getBoundingClientRect()`, and toggle two CSS classes (`drag-insert-before` / `drag-insert-after`) on the row accordingly — driving a `::before`/`::after` pseudo-element or a bordered edge — instead of always setting `borderTop`.

The existing `fromIdx`/`toIdx` computation on `drop` needs a small adjustment: if the insertion point is "after" the hovered row, the target index shifts by one relative to today's behavior (which always inserts at `rowIdx`, i.e., always "before"). This is the one behavioral change beyond pure styling — it makes drop position match what the indicator shows.

### 3. Drag state styling

- Dragged row: keep dimmed opacity (already present), ensure it's restored on `dragend` even if the drop target was invalid or outside the grid.
- Hovered valid drop target: no full-row highlight beyond the insertion line, to keep the signal specific (avoids "which row is highlighted vs. where exactly will it land" ambiguity).
- Reset all transient classes/styles (`dragging`, `drag-insert-before`, `drag-insert-after`, inline `borderTop` if left over from the old approach) on `dragend`, `drop`, and `dragleave` of the table body as a whole, not just per-row, so a drag that ends outside the grid doesn't leave stale styling.

### 4. Files touched

- `tools/mep-manifest/src/ui/experiences-tab.js` — handle markup, dragover/drop logic, index-adjustment for before/after.
- `tools/mep-manifest/mep-manifest.css` — grip icon styling, `cursor: grabbing`, insertion-line classes, dragging-row opacity class (replacing inline `tr.style.opacity`/`tr.style.borderTop` with CSS classes where practical).

## Testing

Manual verification in the browser (this tool has no existing test suite for the UI layer):
- Drag a row up/down within a multi-row grid; confirm the insertion line shows above/below correctly as the cursor moves within a row.
- Drop above the first row and below the last row; confirm both work.
- Start a drag and release outside the table; confirm no stale highlight/opacity remains.
- Confirm the resulting row order matches what's shown after drop, and that Save persists the new order to DA (existing `toSheet()`/`saveManifest()` path — no changes expected here, but worth a smoke check).
