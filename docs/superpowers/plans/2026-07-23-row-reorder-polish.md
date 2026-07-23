# Row Reorder Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the MEP manifest tool's existing row drag-and-drop reordering discoverable and precise — a visible grip handle, an unambiguous before/after insertion indicator, and reliable cleanup — with no changes to the data model or DA save flow.

**Architecture:** Pure UI polish inside the existing native HTML5 drag-and-drop implementation in the Experiences grid. No new dependencies, no schema changes: row order is already array position and already persists correctly through `model.toSheet()` / `saveManifest()`.

**Tech Stack:** Vanilla JS (ES modules), plain CSS with custom properties. No framework, no drag library.

## Global Constraints

- No new npm dependencies — stay vanilla JS / CSS, matching the rest of `tools/mep-manifest`.
- Only these files change: `tools/mep-manifest/src/ui/experiences-tab.js`, `tools/mep-manifest/mep-manifest.css`.
- No changes to `tools/mep-manifest/src/data/manifest-model.js` (`moveRow` is already correct), `da-sheet-adapter.js`, or the save/preview/publish flow in `app.js`.
- Out of scope, do not build: keyboard-based reordering (up/down buttons), touch/mobile drag support.
- This tool has no automated test runner (`package.json` has no `test` script and no jsdom/jest/vitest devDependency). Verification is manual, in-browser, via `aem up` — this matches the project's existing convention for this tool (see `docs/superpowers/specs/2026-07-23-row-reorder-polish-design.md`, "Testing" section). Do not introduce a new test framework as part of this change.

---

### Task 1: Visible drag handle + CSS-driven dragging state

**Files:**
- Modify: `tools/mep-manifest/src/ui/experiences-tab.js:145-169` (the "Row number / drag handle" block inside the `model.experiences.rows.forEach` loop in `render()`)
- Modify: `tools/mep-manifest/mep-manifest.css:380-394` (the "Row handle" section)

**Interfaces:**
- Consumes: `model.moveRow(fromIdx, toIdx)` (unchanged, from `manifest-model.js:125-129`), `render()` (the local closure in `experiences-tab.js:98`), `rowIdx`/`row`/`tr` (loop-scoped variables already in place).
- Produces: a `.drag-handle` div (with child `.drag-handle-grip` span and a row-number span) inside the existing `.col-handle` `<td>`. A `row-dragging` class toggled on the `<tr>` during drag, replacing the old inline `tr.style.opacity` toggle. Task 2 builds directly on this markup and on the `row-dragging` class name.

This task keeps today's drop behavior unchanged (dropping still always inserts *before* the hovered row) — it only makes the handle visible and moves the dragging-row style from inline JS styles to a CSS class. Task 2 adds the before/after insertion-line logic on top of this.

- [ ] **Step 1: Replace the row-handle markup and drag styling in `experiences-tab.js`**

Find this block at `experiences-tab.js:145-169`:

```js
      // Row number / drag handle
      const handleTd = document.createElement('td');
      handleTd.className = 'col-handle';
      handleTd.textContent = rowIdx + 1;
      handleTd.draggable = true;
      handleTd.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', rowIdx);
        tr.style.opacity = '0.4';
      });
      handleTd.addEventListener('dragend', () => { tr.style.opacity = '1'; });
      tr.addEventListener('dragover', (e) => {
        e.preventDefault();
        tr.style.borderTop = '2px solid var(--mep-primary)';
      });
      tr.addEventListener('dragleave', () => { tr.style.borderTop = ''; });
      tr.addEventListener('drop', (e) => {
        e.preventDefault();
        tr.style.borderTop = '';
        const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
        if (fromIdx !== rowIdx) {
          model.moveRow(fromIdx, rowIdx);
          render();
        }
      });
      tr.append(handleTd);
```

Replace it with:

```js
      // Row number / drag handle
      const handleTd = document.createElement('td');
      handleTd.className = 'col-handle';

      const handle = document.createElement('div');
      handle.className = 'drag-handle';
      handle.draggable = true;
      handle.title = 'Drag to reorder';

      const grip = document.createElement('span');
      grip.className = 'drag-handle-grip';
      grip.textContent = '⠿';
      grip.setAttribute('aria-hidden', 'true');

      const rowNum = document.createElement('span');
      rowNum.textContent = rowIdx + 1;

      handle.append(grip, rowNum);
      handleTd.append(handle);

      handle.addEventListener('dragstart', (e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(rowIdx));
        tr.classList.add('row-dragging');
      });
      handle.addEventListener('dragend', () => { tr.classList.remove('row-dragging'); });
      tr.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        tr.style.borderTop = '2px solid var(--mep-primary)';
      });
      tr.addEventListener('dragleave', () => { tr.style.borderTop = ''; });
      tr.addEventListener('drop', (e) => {
        e.preventDefault();
        tr.style.borderTop = '';
        const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
        if (fromIdx !== rowIdx) {
          model.moveRow(fromIdx, rowIdx);
          render();
        }
      });
      tr.append(handleTd);
```

- [ ] **Step 2: Update the "Row handle" CSS section**

Find this block at `mep-manifest.css:380-394`:

```css
/* Row handle */
.mep-grid td.col-handle {
  width: 32px;
  min-width: 32px;
  max-width: 32px;
  text-align: center;
  color: var(--mep-text-secondary);
  cursor: grab;
  font-size: 12px;
  vertical-align: middle;
}

.mep-grid td.col-handle:hover {
  background: #f0f0f0;
}
```

Replace it with:

```css
/* Row handle */
.mep-grid td.col-handle {
  width: 32px;
  min-width: 32px;
  max-width: 32px;
  padding: 0;
  vertical-align: middle;
}

.mep-grid .drag-handle {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  width: 100%;
  height: 100%;
  min-height: 36px;
  color: var(--mep-text-secondary);
  font-size: 12px;
  cursor: grab;
  user-select: none;
}

.mep-grid .drag-handle:hover {
  background: #f0f0f0;
}

.mep-grid .drag-handle-grip {
  font-size: 13px;
  line-height: 1;
}

.mep-grid tr.row-dragging {
  opacity: 0.4;
}

.mep-grid tr.row-dragging .drag-handle {
  cursor: grabbing;
}
```

- [ ] **Step 3: Lint**

Run:
```bash
cd tools/mep-manifest && npx eslint src/ui/experiences-tab.js && npx stylelint ../../mep-manifest.css
```
Expected: no errors (the repo's root `npm run lint:js` / `npm run lint:css` also cover this file — either works; use whichever runs faster from your shell).

- [ ] **Step 4: Manual browser check**

Run `aem up` from the repo root, then open `http://localhost:3000/tools/mep-manifest/mep-manifest.html` in a browser. In the file browser header, click the **NEW** pill, enter any name (e.g. `test-reorder`), click **Create**. In the Experiences grid, click **+ Add Row** four times so there are 4 rows.

Confirm:
- Each row's leftmost cell shows a grip icon (⠿) next to the row number, with `cursor: grab` on hover.
- Dragging a row by its handle dims it to ~40% opacity while dragging, and a blue line appears at the top of whatever row is under the cursor.
- Releasing the drop still reorders the rows (behavior unchanged from before this task — only the visuals changed).

- [ ] **Step 5: Commit**

```bash
git add tools/mep-manifest/src/ui/experiences-tab.js tools/mep-manifest/mep-manifest.css
git commit -m "feat: add visible grip handle for row drag-and-drop"
```

---

### Task 2: Before/after insertion-line indicator with corrected drop math

**Files:**
- Modify: `tools/mep-manifest/src/ui/experiences-tab.js` (the `tbody` setup just above the row loop, and the drag event listeners inside the row loop that Task 1 left in place)
- Modify: `tools/mep-manifest/mep-manifest.css` (append new rules after the block Task 1 added)

**Interfaces:**
- Consumes: `handle`, `handleTd`, `tr`, `rowIdx`, `tbody` (all already in scope from Task 1 / the surrounding `render()` closure), `model.moveRow(fromIdx, toIdx)`.
- Produces: a `clearDragIndicators()` helper function (module-private, defined once per `render()` call) that Task 3's manual test relies on indirectly (it's what makes the indicator behave correctly, not something a later task calls directly).

This task replaces the "always insert before the hovered row" behavior with an explicit above/below check based on cursor position, and fixes the index math so the drop lands exactly where the indicator shows.

- [ ] **Step 1: Add the `clearDragIndicators` helper**

Find this in `experiences-tab.js` (added once, right after `const tbody = document.createElement('tbody');` inside `render()`):

```js
    // Body
    const tbody = document.createElement('tbody');
```

Replace it with:

```js
    // Body
    const tbody = document.createElement('tbody');

    function clearDragIndicators() {
      tbody.querySelectorAll('tr').forEach((row) => {
        row.classList.remove('drag-insert-before', 'drag-insert-after');
      });
    }
```

- [ ] **Step 2: Replace the dragover/dragleave/drop/dragend handlers with before/after logic**

Find this block (as left by Task 1) inside the row loop:

```js
      handle.addEventListener('dragstart', (e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(rowIdx));
        tr.classList.add('row-dragging');
      });
      handle.addEventListener('dragend', () => { tr.classList.remove('row-dragging'); });
      tr.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        tr.style.borderTop = '2px solid var(--mep-primary)';
      });
      tr.addEventListener('dragleave', () => { tr.style.borderTop = ''; });
      tr.addEventListener('drop', (e) => {
        e.preventDefault();
        tr.style.borderTop = '';
        const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
        if (fromIdx !== rowIdx) {
          model.moveRow(fromIdx, rowIdx);
          render();
        }
      });
```

Replace it with:

```js
      handle.addEventListener('dragstart', (e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(rowIdx));
        tr.classList.add('row-dragging');
      });

      handle.addEventListener('dragend', () => {
        tr.classList.remove('row-dragging');
        clearDragIndicators();
      });

      tr.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        const rect = tr.getBoundingClientRect();
        const isBottomHalf = (e.clientY - rect.top) > rect.height / 2;

        clearDragIndicators();
        tr.classList.add(isBottomHalf ? 'drag-insert-after' : 'drag-insert-before');
      });

      tr.addEventListener('dragleave', (e) => {
        if (!tr.contains(e.relatedTarget)) {
          tr.classList.remove('drag-insert-before', 'drag-insert-after');
        }
      });

      tr.addEventListener('drop', (e) => {
        e.preventDefault();
        const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
        const isAfter = tr.classList.contains('drag-insert-after');
        clearDragIndicators();

        if (Number.isNaN(fromIdx) || fromIdx === rowIdx) return;

        let toIdx = isAfter ? rowIdx + 1 : rowIdx;
        // moveRow splices the row out first, which shifts every index
        // after it down by one — compensate when dragging downward.
        if (fromIdx < toIdx) toIdx -= 1;

        model.moveRow(fromIdx, toIdx);
        render();
      });
```

- [ ] **Step 3: Add the insertion-line CSS**

Append this after the block Task 1 added in `mep-manifest.css` (i.e., right after the `.mep-grid tr.row-dragging .drag-handle { cursor: grabbing; }` rule):

```css
/* Drag insertion-line indicator */
.mep-grid tr.drag-insert-before td {
  box-shadow: inset 0 2px 0 0 var(--mep-primary);
}

.mep-grid tr.drag-insert-after td {
  box-shadow: inset 0 -2px 0 0 var(--mep-primary);
}
```

- [ ] **Step 4: Lint**

Run:
```bash
cd tools/mep-manifest && npx eslint src/ui/experiences-tab.js && npx stylelint ../../mep-manifest.css
```
Expected: no errors.

- [ ] **Step 5: Manual browser check — verify the index math**

Using the same local setup as Task 1 (`aem up`, open the tool, create a test manifest, add 4 rows). Before testing, type a distinct value into the Selector cell of each row (e.g. `row-1`, `row-2`, `row-3`, `row-4`) so you can track identity by content, not just position.

Confirm each of these:
1. Hover the cursor over the **top half** of a row while dragging another row over it → the blue line appears **above** that row. Drop → the dragged row ends up directly above it.
2. Hover over the **bottom half** of a row → the line appears **below** it. Drop → the dragged row ends up directly below it.
3. Drag `row-1` and drop it in the bottom half of `row-4` (the last row) → final order is `row-2, row-3, row-4, row-1`.
4. Drag `row-4` and drop it in the top half of `row-1` (the first row) → final order is `row-4, row-1, row-2, row-3`.
5. Start dragging a row, then release the mouse button outside the table entirely (e.g. over the toolbar) → no blue line or dimmed row is left behind; the grid returns to normal.
6. Click **Save** after a reorder (if you have DA credentials configured for this to succeed) or at minimum confirm no console errors are thrown — order persistence itself goes through the unchanged `model.toSheet()` / `saveManifest()` path and isn't otherwise re-tested here.

- [ ] **Step 6: Commit**

```bash
git add tools/mep-manifest/src/ui/experiences-tab.js tools/mep-manifest/mep-manifest.css
git commit -m "feat: add before/after insertion indicator to row drag-and-drop"
```

---

## Self-Review Notes

- **Spec coverage:** Task 1 covers spec section "1. Visible handle." Task 2 covers spec sections "2. Insertion-line indicator" and "3. Drag state styling" (dimmed dragged row is Task 1; hover/insertion-line + full cleanup on dragend/dragleave is Task 2). Both tasks together cover "4. Files touched." The spec's "Testing" bullets map directly to Task 1 Step 4 and Task 2 Step 5.
- **Placeholder scan:** No TBDs; every step has complete, runnable code and exact commands.
- **Type/name consistency:** `clearDragIndicators` (Task 2 Step 1) is the exact name used in Task 2 Step 2's handlers. `row-dragging`, `drag-insert-before`, `drag-insert-after`, `drag-handle`, `drag-handle-grip` are the same class strings across the JS and CSS steps in both tasks.
