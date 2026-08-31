import { MANIFEST_TYPES, EXECUTION_ORDERS } from '../data/manifest-model.js';
import { getActions, isExtendedAction, getExtendedActionColor } from '../data/actions-registry.js';

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
  function render() {
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

    headerRow.append(createTh('#', 'col-handle'));
    headerRow.append(createTh('Action', 'col-action', true, 'action', model));
    headerRow.append(createTh('Selector', 'col-selector', true, 'selector', model));
    headerRow.append(createTh('Page Filter', 'col-page-filter', true, 'pageFilter', model));

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
      const th = createTh('', `col-experience${isTarget ? ' target' : ''}`, true, col.name, model);

      const colNameLabel = document.createElement('span');
      colNameLabel.className = 'col-name-label';
      colNameLabel.textContent = col.name;
      colNameLabel.title = 'Double-click to rename';
      colNameLabel.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        showRenameColumnDialog(model, colIdx, render);
      });
      th.prepend(colNameLabel);

      const grip = document.createElement('span');
      grip.className = 'col-drag-handle';
      grip.textContent = '⠿';
      grip.title = 'Drag to reorder column';
      grip.setAttribute('aria-hidden', 'true');
      grip.draggable = true;
      th.prepend(grip);

      grip.addEventListener('dragstart', (e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/mep-column-index', String(colIdx));
        getColumnCells(colIdx).forEach((cell) => cell.classList.add('col-dragging'));
      });

      grip.addEventListener('dragend', () => {
        getColumnCells(colIdx).forEach((cell) => cell.classList.remove('col-dragging'));
        clearColumnDragIndicators();
      });

      th.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        const rect = th.getBoundingClientRect();
        const isRightHalf = (e.clientX - rect.left) > rect.width / 2;

        clearColumnDragIndicators();
        getColumnCells(colIdx).forEach((cell) => {
          cell.classList.add(isRightHalf ? 'col-insert-after' : 'col-insert-before');
        });
      });

      th.addEventListener('dragleave', (e) => {
        if (!th.contains(e.relatedTarget)) {
          getColumnCells(colIdx).forEach((cell) => {
            cell.classList.remove('col-insert-before', 'col-insert-after');
          });
        }
      });

      th.addEventListener('drop', (e) => {
        e.preventDefault();
        const fromIdx = parseInt(e.dataTransfer.getData('text/mep-column-index'), 10);
        const isAfter = th.classList.contains('col-insert-after');
        clearColumnDragIndicators();

        if (Number.isNaN(fromIdx) || fromIdx === colIdx) return;

        let toIdx = isAfter ? colIdx + 1 : colIdx;
        // moveColumn splices the column out first, which shifts every
        // index after it down by one — compensate when dragging right.
        if (fromIdx < toIdx) toIdx -= 1;

        model.moveColumn(fromIdx, toIdx);
        render();
      });

      if (!col.isDefault) {
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'col-delete-header-btn';
        deleteBtn.textContent = '×';
        deleteBtn.title = 'Delete column';
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          showDeleteColumnDialog(model, colIdx, render);
        });
        th.append(deleteBtn);
      }

      headerRow.append(th);
    });

    const addColTh = document.createElement('th');
    addColTh.className = 'col-add';
    addColTh.textContent = '+';
    addColTh.title = 'Add Experience Column';
    addColTh.addEventListener('click', () => showAddColumnDialog(model, render));
    headerRow.append(addColTh);

    headerRow.append(createTh('', 'col-handle'));

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

      // Row resize handle — drag the bottom edge to set an explicit row height.
      const rowResizeHandle = document.createElement('span');
      rowResizeHandle.className = 'mep-row-resize-handle';
      rowResizeHandle.title = 'Drag to resize row';
      rowResizeHandle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const startY = e.clientY;
        const startH = tr.getBoundingClientRect().height;
        let newH = startH;

        function onMove(me) {
          newH = Math.max(36, startH + (me.clientY - startY));
          tr.style.setProperty('--mep-row-height', `${newH}px`);
          tr.classList.add('row-resized');
        }
        function onUp() {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          if (newH !== startH) model.setRowHeight(rowIdx, newH);
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
      handleTd.append(rowResizeHandle);

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
      deleteBtn.textContent = '\u00D7';
      deleteBtn.title = 'Delete row';
      deleteBtn.addEventListener('click', () => { model.removeRow(rowIdx); render(); });
      deleteTd.append(deleteBtn);
      tr.append(deleteTd);

      tbody.append(tr);
    });

    table.append(tbody);
    gridWrapper.append(table);
    wrap.append(gridWrapper);

    // Restore scroll position
    gridWrapper.scrollLeft = savedScrollLeft;
    gridWrapper.scrollTop = savedScrollTop;

    // Add row button
    const footer = document.createElement('div');
    footer.className = 'mep-grid-footer';
    const addRowBtn = document.createElement('button');
    addRowBtn.className = 'mep-btn';
    addRowBtn.textContent = '+ Add Row';
    addRowBtn.addEventListener('click', () => { model.addRow(); render(); });
    footer.append(addRowBtn);
    wrap.append(footer);
  }

  render();
  container.append(wrap);
  return { el: wrap, refresh: render };
}

/**
 * Creates a <th> with a drag-to-resize handle on its right edge.
 * Resizing sets the th's own width/minWidth, which drives the column width.
 * When a colId + model are given, the persisted width is applied up front and
 * committed to the model on mouse-up so it survives re-render and save.
 */
function createTh(text, className, resizable = false, colId = null, model = null) {
  const th = document.createElement('th');
  th.className = className;
  th.textContent = text;

  // Apply any persisted width so a rebuilt table reproduces the saved size.
  const savedWidth = colId && model ? model.experiences.columnWidths[colId] : null;
  if (Number.isFinite(savedWidth)) {
    th.style.width = `${savedWidth}px`;
    th.style.minWidth = `${savedWidth}px`;
  }

  if (resizable) {
    const handle = document.createElement('span');
    handle.className = 'mep-col-resize-handle';
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = th.offsetWidth;
      let newW = startW;

      function onMove(me) {
        newW = Math.max(60, startW + (me.clientX - startX));
        th.style.width = `${newW}px`;
        th.style.minWidth = `${newW}px`;
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        if (colId && model && newW !== startW) model.setColumnWidth(colId, newW);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
    th.append(handle);
  }

  return th;
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

/**
 * Textarea cell with auto-grow and URL link button.
 * Used for Selector and Experience columns.
 */
function createTextCell(value, onChange) {
  const td = document.createElement('td');
  const wrapper = document.createElement('div');
  wrapper.className = 'cell-wrapper';

  const textarea = document.createElement('textarea');
  textarea.className = 'cell-input';
  textarea.rows = 1;
  textarea.value = value;

  function autoGrow() {
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }

  textarea.addEventListener('input', () => {
    autoGrow();
    onChange(textarea.value);
  });

  wrapper.append(textarea);

  // URL link button — only visible when value is a URL
  const linkBtn = document.createElement('a');
  linkBtn.className = 'cell-link-btn';
  linkBtn.target = '_blank';
  linkBtn.rel = 'noopener noreferrer';
  linkBtn.title = 'Open URL';
  linkBtn.textContent = '↗';

  function updateLinkBtn() {
    const val = textarea.value.trim();
    const isUrl = /^https?:\/\//i.test(val);
    linkBtn.style.display = isUrl ? '' : 'none';
    if (isUrl) linkBtn.href = val;
  }

  textarea.addEventListener('input', updateLinkBtn);
  updateLinkBtn();
  wrapper.append(linkBtn);

  td.append(wrapper);
  requestAnimationFrame(autoGrow);
  return td;
}

/**
 * Plain input cell — used for Page Filter.
 */
function createInputCell(value, onChange) {
  const td = document.createElement('td');
  const input = document.createElement('input');
  input.className = 'cell-input cell-input-plain';
  input.type = 'text';
  input.value = value;
  input.addEventListener('change', (e) => onChange(e.target.value));
  td.append(input);
  return td;
}

function isDuplicateColumnName(model, name, excludeIdx = -1) {
  const trimmed = name.trim().toLowerCase();
  return model.experiences.columns.some(
    (c, i) => i !== excludeIdx && c.name.toLowerCase() === trimmed,
  );
}

function showAddColumnDialog(model, refreshFn) {
  const overlay = document.createElement('div');
  overlay.className = 'mep-dialog-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'mep-dialog';

  const h3 = document.createElement('h3');
  h3.textContent = 'Add Experience Column';

  const field = document.createElement('div');
  field.className = 'mep-field';
  const label = document.createElement('label');
  label.className = 'mep-field-label';
  label.textContent = 'Column Name';
  const input = document.createElement('input');
  input.className = 'mep-input';
  input.type = 'text';
  input.placeholder = 'e.g., all, target-returning-users';
  input.autofocus = true;
  const errorEl = document.createElement('div');
  errorEl.className = 'mep-field-error';
  errorEl.hidden = true;
  field.append(label, input, errorEl);

  const actions = document.createElement('div');
  actions.className = 'mep-dialog-actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'mep-btn';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => overlay.remove());

  function showError(message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
    input.classList.add('mep-input-error');
  }

  function clearError() {
    errorEl.hidden = true;
    input.classList.remove('mep-input-error');
  }

  const addBtn = document.createElement('button');
  addBtn.className = 'mep-btn mep-btn-primary';
  addBtn.textContent = 'Add';
  addBtn.addEventListener('click', () => {
    const name = input.value.trim();
    if (!name) {
      showError('Column name is required.');
      return;
    }
    if (isDuplicateColumnName(model, name)) {
      showError(`A column named "${name}" already exists.`);
      return;
    }
    model.addColumn(name);
    overlay.remove();
    refreshFn();
  });

  input.addEventListener('input', clearError);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addBtn.click();
    if (e.key === 'Escape') overlay.remove();
  });

  actions.append(cancelBtn, addBtn);
  dialog.append(h3, field, actions);
  overlay.append(dialog);
  document.body.append(overlay);

  requestAnimationFrame(() => input.focus());
}

function showDeleteColumnDialog(model, colIdx, refreshFn) {
  const col = model.experiences.columns[colIdx];

  const overlay = document.createElement('div');
  overlay.className = 'mep-dialog-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'mep-dialog';

  const h3 = document.createElement('h3');
  h3.textContent = 'Delete Column';

  const message = document.createElement('p');
  message.textContent = `Delete column "${col.name}"? All values in this column will be lost for every row.`;

  const actions = document.createElement('div');
  actions.className = 'mep-dialog-actions';

  function onKeydown(e) {
    if (e.key === 'Escape') {
      overlay.remove();
      document.removeEventListener('keydown', onKeydown);
    }
  }

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'mep-btn';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => {
    overlay.remove();
    document.removeEventListener('keydown', onKeydown);
  });

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'mep-btn mep-btn-danger';
  deleteBtn.textContent = 'Delete';
  deleteBtn.addEventListener('click', () => {
    model.removeColumn(colIdx);
    overlay.remove();
    document.removeEventListener('keydown', onKeydown);
    refreshFn();
  });

  document.addEventListener('keydown', onKeydown);

  actions.append(cancelBtn, deleteBtn);
  dialog.append(h3, message, actions);
  overlay.append(dialog);
  document.body.append(overlay);
}

function showRenameColumnDialog(model, colIdx, refreshFn) {
  const col = model.experiences.columns[colIdx];

  const overlay = document.createElement('div');
  overlay.className = 'mep-dialog-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'mep-dialog';

  const h3 = document.createElement('h3');
  h3.textContent = 'Rename Column';

  const field = document.createElement('div');
  field.className = 'mep-field';
  const label = document.createElement('label');
  label.className = 'mep-field-label';
  label.textContent = 'Column Name';
  const input = document.createElement('input');
  input.className = 'mep-input';
  input.type = 'text';
  input.value = col.name;
  input.autofocus = true;
  const errorEl = document.createElement('div');
  errorEl.className = 'mep-field-error';
  errorEl.hidden = true;
  field.append(label, input, errorEl);

  function showError(message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
    input.classList.add('mep-input-error');
  }

  function clearError() {
    errorEl.hidden = true;
    input.classList.remove('mep-input-error');
  }

  const actions = document.createElement('div');
  actions.className = 'mep-dialog-actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'mep-btn';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => overlay.remove());

  const saveBtn = document.createElement('button');
  saveBtn.className = 'mep-btn mep-btn-primary';
  saveBtn.textContent = 'Save';
  saveBtn.addEventListener('click', () => {
    const name = input.value.trim();
    if (!name) {
      showError('Column name is required.');
      return;
    }
    if (isDuplicateColumnName(model, name, colIdx)) {
      showError(`A column named "${name}" already exists.`);
      return;
    }
    const ok = model.renameColumn(colIdx, name);
    if (!ok) {
      showError('Could not rename this column.');
      return;
    }
    overlay.remove();
    refreshFn();
  });

  input.addEventListener('input', clearError);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveBtn.click();
    if (e.key === 'Escape') overlay.remove();
  });

  actions.append(cancelBtn, saveBtn);
  dialog.append(h3, field, actions);
  overlay.append(dialog);
  document.body.append(overlay);

  requestAnimationFrame(() => { input.focus(); input.select(); });
}
