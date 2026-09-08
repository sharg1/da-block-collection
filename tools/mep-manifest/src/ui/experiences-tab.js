import { MANIFEST_TYPES, EXECUTION_ORDERS } from '../data/manifest-model.js';
import { getActions, isExtendedAction, getExtendedActionColor } from '../data/actions-registry.js';
import {
  createResizableTh, attachColumnDragReorder, attachRowDragReorder, attachRowResize,
  createTextCell, createInputCell,
  showAddColumnDialog, showDeleteColumnDialog, showRenameColumnDialog,
} from './grid-helpers.js';

// Maps action name → CSS class for the action <td> left-border accent
const ACTION_CSS_MAP = {
  remove: 'action-remove',
  replace: 'action-replace',
  insertBefore: 'action-insertbefore',
  insertAfter: 'action-insertafter',
  prependToSection: 'action-prependtosection',
  appendToSection: 'action-appendtosection',
  replacePage: 'action-replacepage',
  useBlockCode: 'action-useblockcode',
  insertScript: 'action-insertscript',
  updateMetadata: 'action-updatemetadata',
};

// Maps action name → CSS class applied to the entire <tr> for row background
const ROW_CSS_MAP = {
  remove: 'row-remove',
  replace: 'row-replace',
  insertBefore: 'row-insertbefore',
  insertAfter: 'row-insertafter',
  prependToSection: 'row-prependtosection',
  appendToSection: 'row-appendtosection',
  replacePage: 'row-replacepage',
  useBlockCode: 'row-useblockcode',
  insertScript: 'row-insertscript',
  updateMetadata: 'row-updatemetadata',
};

function isDuplicateColumnName(model, name, excludeIdx = -1) {
  const trimmed = name.trim().toLowerCase();
  return model.experiences.columns.some(
    (c, i) => i !== excludeIdx && c.name.toLowerCase() === trimmed,
  );
}

/**
 * Renders the Experiences tab — includes an inline info bar at the top
 * (Manifest Type, Execution Order, Override Name) followed by the main grid.
 */
export function renderExperiencesTab(container, model) {
  const wrap = document.createElement('div');
  wrap.className = 'mep-tab-content';
  wrap.id = 'tab-experiences';

  // ---- Info bar (built once, outside render()) ----
  const infoBar = document.createElement('div');
  infoBar.className = 'mep-info-bar';

  // Manifest Type
  const typeField = document.createElement('div');
  typeField.className = 'mep-field';
  const typeLabel = document.createElement('label');
  typeLabel.className = 'mep-field-label';
  typeLabel.textContent = 'Manifest Type';
  const typeSelect = document.createElement('select');
  typeSelect.className = 'mep-select';
  MANIFEST_TYPES.forEach((t) => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t.charAt(0).toUpperCase() + t.slice(1);
    if (t === model.info.type) opt.selected = true;
    typeSelect.append(opt);
  });
  typeSelect.addEventListener('change', (e) => model.setInfo('type', e.target.value));
  typeField.append(typeLabel, typeSelect);

  // Execution Order
  const orderField = document.createElement('div');
  orderField.className = 'mep-field';
  const orderLabel = document.createElement('label');
  orderLabel.className = 'mep-field-label';
  orderLabel.textContent = 'Execution Order';
  const orderSelect = document.createElement('select');
  orderSelect.className = 'mep-select';
  EXECUTION_ORDERS.forEach((o) => {
    const opt = document.createElement('option');
    opt.value = o;
    opt.textContent = o;
    if (o === model.info.executionOrder) opt.selected = true;
    orderSelect.append(opt);
  });
  orderSelect.addEventListener('change', (e) => model.setInfo('executionOrder', e.target.value));
  orderField.append(orderLabel, orderSelect);

  // Override Name
  const nameField = document.createElement('div');
  nameField.className = 'mep-field';
  const nameLabel = document.createElement('label');
  nameLabel.className = 'mep-field-label';
  nameLabel.textContent = 'Override Name';
  const nameInput = document.createElement('input');
  nameInput.className = 'mep-input';
  nameInput.type = 'text';
  nameInput.placeholder = 'optional';
  nameInput.value = model.info.overrideName || '';
  nameInput.addEventListener('change', (e) => model.setInfo('overrideName', e.target.value));
  nameField.append(nameLabel, nameInput);

  infoBar.append(typeField, orderField, nameField);
  wrap.append(infoBar);

  // ---- Grid (rebuilt on each render()) ----
  // opts.revealLastRow: after rendering, scroll the newly added (last) row into
  // view and focus its first field instead of preserving the prior scroll
  // position. Used by "+ Add Row"; every other caller preserves position.
  function render(opts = {}) {
    // Preserve scroll position before re-rendering
    let savedScrollLeft = 0;
    let savedScrollTop = 0;
    const existingGridWrapper = wrap.querySelector('.mep-grid-wrapper');
    if (existingGridWrapper) {
      savedScrollLeft = existingGridWrapper.scrollLeft;
      savedScrollTop = existingGridWrapper.scrollTop;
    }

    // Remove everything after the info bar
    while (wrap.lastChild !== infoBar) wrap.removeChild(wrap.lastChild);

    const gridWrapper = document.createElement('div');
    gridWrapper.className = 'mep-grid-wrapper';

    const table = document.createElement('table');
    table.className = 'mep-grid';

    // Declared early (before thead/tbody are populated below) so the
    // column-header drag handlers can reference it without triggering
    // no-use-before-define — it's only populated once the "Body" section runs.
    const tbody = document.createElement('tbody');

    // Header
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');

    headerRow.append(createResizableTh('#', 'col-handle'));
    headerRow.append(createResizableTh('Action', 'col-action', {
      savedWidth: model.experiences.columnWidths.action,
      onResize: (w) => model.setColumnWidth('action', w),
    }));
    headerRow.append(createResizableTh('Selector', 'col-selector', {
      savedWidth: model.experiences.columnWidths.selector,
      onResize: (w) => model.setColumnWidth('selector', w),
    }));
    headerRow.append(createResizableTh('Page Filter', 'col-page-filter', {
      savedWidth: model.experiences.columnWidths.pageFilter,
      onResize: (w) => model.setColumnWidth('pageFilter', w),
    }));

    // Fixed columns above occupy header/row positions 0-3; experience
    // columns start at position 4 — used to find each column's cells
    // (header th + every row's td) for drag indicator styling.
    const FIXED_COL_COUNT = 4;

    function getColumnCells(colIdx) {
      const cellIdx = FIXED_COL_COUNT + colIdx;
      const cells = [headerRow.children[cellIdx]];
      tbody.querySelectorAll('tr').forEach((row) => {
        cells.push(row.children[cellIdx]);
      });
      return cells;
    }

    function clearColumnDragIndicators() {
      table.querySelectorAll('.col-insert-before, .col-insert-after').forEach((cell) => {
        cell.classList.remove('col-insert-before', 'col-insert-after');
      });
    }

    model.experiences.columns.forEach((col, colIdx) => {
      const isTarget = col.name.toLowerCase().startsWith('target');
      const th = createResizableTh('', `col-experience${isTarget ? ' target' : ''}`, {
        savedWidth: model.experiences.columnWidths[col.name],
        onResize: (w) => model.setColumnWidth(col.name, w),
      });

      const colNameLabel = document.createElement('span');
      colNameLabel.className = 'col-name-label';
      colNameLabel.textContent = col.name;
      colNameLabel.title = 'Double-click to rename';
      colNameLabel.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        showRenameColumnDialog({
          currentName: col.name,
          isDuplicate: (name) => isDuplicateColumnName(model, name, colIdx),
          onRename: (name) => {
            const ok = model.renameColumn(colIdx, name);
            if (ok) render();
            return ok;
          },
        });
      });
      th.prepend(colNameLabel);

      const grip = document.createElement('span');
      grip.className = 'col-drag-handle';
      grip.textContent = '⠿';
      grip.title = 'Drag to reorder column';
      grip.setAttribute('aria-hidden', 'true');
      th.prepend(grip);

      attachColumnDragReorder(th, grip, colIdx, {
        getColumnCells,
        clearIndicators: clearColumnDragIndicators,
        onDrop: (fromIdx, toIdx) => {
          model.moveColumn(fromIdx, toIdx);
          render();
        },
      });

      if (!col.isDefault) {
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'col-delete-header-btn';
        deleteBtn.textContent = '×';
        deleteBtn.title = 'Delete column';
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          showDeleteColumnDialog({
            colName: col.name,
            onDelete: () => {
              model.removeColumn(colIdx);
              render();
            },
          });
        });
        th.append(deleteBtn);
      }

      headerRow.append(th);
    });

    const addColTh = document.createElement('th');
    addColTh.className = 'col-add';
    addColTh.textContent = '+';
    addColTh.title = 'Add Experience Column';
    addColTh.addEventListener('click', () => showAddColumnDialog({
      title: 'Add Experience Column',
      placeholder: 'e.g., all, target-returning-users',
      isDuplicate: (name) => isDuplicateColumnName(model, name),
      onAdd: (name) => {
        model.addColumn(name);
        render();
      },
    }));
    headerRow.append(addColTh);

    headerRow.append(createResizableTh('', 'col-handle'));

    thead.append(headerRow);
    table.append(thead);

    // Body

    function clearDragIndicators() {
      tbody.querySelectorAll('tr').forEach((row) => {
        row.classList.remove('drag-insert-before', 'drag-insert-after');
      });
    }

    model.experiences.rows.forEach((row, rowIdx) => {
      const tr = document.createElement('tr');

      // Reapply any persisted row height so a rebuilt table keeps the size.
      const savedHeight = model.experiences.rowHeights[rowIdx];
      if (Number.isFinite(savedHeight)) {
        tr.style.setProperty('--mep-row-height', `${savedHeight}px`);
        tr.classList.add('row-resized');
      }

      // Apply row background: built-in named class, or the generic custom class
      // for config-defined actions.
      if (row.action) {
        if (ROW_CSS_MAP[row.action]) {
          tr.classList.add(ROW_CSS_MAP[row.action]);
        } else if (isExtendedAction(row.action)) {
          tr.classList.add('row-custom');
          const color = getExtendedActionColor(row.action);
          if (color) tr.style.setProperty('--row-accent', color);
        }
      }

      // Row number / drag handle
      const handleTd = document.createElement('td');
      handleTd.className = 'col-handle';

      const handle = document.createElement('div');
      handle.className = 'drag-handle';
      handle.title = 'Drag to reorder';

      const grip = document.createElement('span');
      grip.className = 'drag-handle-grip';
      grip.textContent = '⠿';
      grip.setAttribute('aria-hidden', 'true');

      const rowNum = document.createElement('span');
      rowNum.textContent = rowIdx + 1;

      handle.append(grip, rowNum);
      handleTd.append(handle);

      // Row resize handle — drag the bottom edge to set an explicit row height.
      const rowResizeHandle = document.createElement('span');
      rowResizeHandle.className = 'mep-row-resize-handle';
      rowResizeHandle.title = 'Drag to resize row';
      attachRowResize(rowResizeHandle, tr, (newH) => model.setRowHeight(rowIdx, newH));
      handleTd.append(rowResizeHandle);

      attachRowDragReorder(tr, handle, rowIdx, {
        clearIndicators: clearDragIndicators,
        onDrop: (fromIdx, toIdx) => {
          model.moveRow(fromIdx, toIdx);
          render();
        },
      });
      tr.append(handleTd);

      // Action cell
      tr.append(createActionCell(row, rowIdx, model, tr));

      // Selector cell — textarea with URL link button
      tr.append(createTextCell(row.selector, (val) => model.updateRow(rowIdx, 'selector', val)));

      // Page Filter cell — plain input
      tr.append(createInputCell(row.pageFilter, (val) => model.updateRow(rowIdx, 'pageFilter', val)));

      // Experience column cells — textarea with URL link button
      model.experiences.columns.forEach((col) => {
        tr.append(createTextCell(
          row.values[col.name] || '',
          (val) => model.updateRowValue(rowIdx, col.name, val),
        ));
      });

      // Add column spacer
      const spacerTd = document.createElement('td');
      spacerTd.style.border = 'none';
      spacerTd.style.background = 'transparent';
      tr.append(spacerTd);

      // Delete row button
      const deleteTd = document.createElement('td');
      deleteTd.className = 'col-delete';
      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = '×';
      deleteBtn.title = 'Delete row';
      deleteBtn.addEventListener('click', () => { model.removeRow(rowIdx); render(); });
      deleteTd.append(deleteBtn);
      tr.append(deleteTd);

      tbody.append(tr);
    });

    table.append(tbody);
    gridWrapper.append(table);
    wrap.append(gridWrapper);

    // Add row button
    const footer = document.createElement('div');
    footer.className = 'mep-grid-footer';
    const addRowBtn = document.createElement('button');
    addRowBtn.className = 'mep-btn';
    addRowBtn.textContent = '+ Add Row';
    addRowBtn.addEventListener('click', () => { model.addRow(); render({ revealLastRow: true }); });
    footer.append(addRowBtn);
    wrap.append(footer);

    // Restore scroll position in a rAF rather than synchronously. Each cell
    // textarea starts at rows=1 and schedules its own requestAnimationFrame to
    // auto-grow to its content height; that relayout is what sets the grid's
    // final scrollHeight. A synchronous restore here runs before those grows,
    // so scrollTop is clamped against a too-short scrollHeight and the grid
    // jumps toward the top once the rows expand. Deferring to a rAF (which runs
    // after the auto-grow rAFs scheduled earlier this frame) restores against
    // the final height. scrollLeft is unaffected by row growth but is restored
    // here too so both axes stay in one place.
    requestAnimationFrame(() => {
      // Horizontal position is always preserved so the user doesn't lose their
      // place among the experience columns.
      gridWrapper.scrollLeft = savedScrollLeft;
      if (opts.revealLastRow) {
        // Scroll to the bottom so the new row is visible, then focus its first
        // field for immediate editing. preventScroll keeps the focus call from
        // yanking the horizontal position back to the left.
        gridWrapper.scrollTop = gridWrapper.scrollHeight;
        const lastTr = tbody.querySelector('tr:last-child');
        const field = lastTr && lastTr.querySelector('select, textarea, input');
        if (field) field.focus({ preventScroll: true });
      } else {
        gridWrapper.scrollTop = savedScrollTop;
      }
    });
  }

  render();
  container.append(wrap);
  return { el: wrap, refresh: render };
}

/**
 * Apply the visual accent for an action to its cell (<td> left border) and row
 * (<tr> background). Clears any prior built-in or custom accent first so
 * switching actions never leaves stale styling behind.
 * - Built-in actions use their named CSS classes (unchanged behavior).
 * - Extended (config) actions use the generic action-custom / row-custom
 *   classes, with an inline --row-accent color when the config supplied one.
 */
function applyActionAccent(td, tr, value) {
  // Clear built-in classes
  Object.values(ACTION_CSS_MAP).forEach((cls) => td.classList.remove(cls));
  Object.values(ROW_CSS_MAP).forEach((cls) => tr.classList.remove(cls));
  // Clear custom accent
  td.classList.remove('action-custom');
  tr.classList.remove('row-custom');
  tr.style.removeProperty('--row-accent');

  if (!value) return;

  if (ACTION_CSS_MAP[value]) {
    td.classList.add(ACTION_CSS_MAP[value]);
    if (ROW_CSS_MAP[value]) tr.classList.add(ROW_CSS_MAP[value]);
    return;
  }

  if (isExtendedAction(value)) {
    td.classList.add('action-custom');
    tr.classList.add('row-custom');
    const color = getExtendedActionColor(value);
    if (color) tr.style.setProperty('--row-accent', color);
  }
}

/**
 * Action dropdown cell — applies left-border accent to the <td>
 * and row background class to the parent <tr>.
 */
function createActionCell(row, rowIdx, model, tr) {
  const td = document.createElement('td');
  td.className = 'action-cell';

  const select = document.createElement('select');
  select.className = 'action-select';

  const emptyOpt = document.createElement('option');
  emptyOpt.value = '';
  emptyOpt.textContent = '— Select Action —';
  select.append(emptyOpt);

  // Options from the merged registry: built-ins first, then config extras.
  let currentIsKnown = !row.action;
  getActions().forEach(({ value, label }) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    if (value === row.action) {
      opt.selected = true;
      currentIsKnown = true;
    }
    select.append(opt);
  });

  // Preserve an action value that isn't in the current registry (e.g. a
  // manifest referencing an action whose config row was removed) so opening
  // and saving the file never silently drops it.
  if (!currentIsKnown) {
    const opt = document.createElement('option');
    opt.value = row.action;
    opt.textContent = row.action;
    opt.selected = true;
    select.append(opt);
  }

  // Initial <td> accent (row background is set by the row renderer).
  if (row.action && ACTION_CSS_MAP[row.action]) {
    td.classList.add(ACTION_CSS_MAP[row.action]);
  } else if (row.action && isExtendedAction(row.action)) {
    td.classList.add('action-custom');
    const color = getExtendedActionColor(row.action);
    if (color) tr.style.setProperty('--row-accent', color);
  }

  select.addEventListener('change', (e) => {
    model.updateRow(rowIdx, 'action', e.target.value);
    applyActionAccent(td, tr, e.target.value);
  });

  td.append(select);
  return td;
}
