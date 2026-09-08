/**
 * Shared grid interactions used by both the Experiences grid and the Promo
 * placeholders grid: resizable column headers, column/row drag-to-reorder,
 * row resize, generic cell renderers, and the add/rename/delete column
 * dialogs. Extracted so both grids get identical drag/resize/dialog behavior
 * without duplicating it.
 */

/**
 * Creates a <th>. When `resize` is given, adds a drag-to-resize handle on the
 * right edge; the persisted width (if any) is applied up front and committed
 * via `resize.onResize` on mouse-up so it survives re-render and save.
 */
export function createResizableTh(text, className, resize = null) {
  const th = document.createElement('th');
  th.className = className;
  th.textContent = text;

  if (resize) {
    const { savedWidth, onResize } = resize;
    if (Number.isFinite(savedWidth)) {
      th.style.width = `${savedWidth}px`;
      th.style.minWidth = `${savedWidth}px`;
    }

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
        if (newW !== startW) onResize(newW);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
    th.append(handle);
  }

  return th;
}

/**
 * Wires a column header's drag grip for reorder-by-drag: dragging over a
 * neighboring header shows an insertion-line indicator on whichever half of
 * it the pointer is over, and dropping calls `onDrop(fromIdx, toIdx)` with
 * indices already adjusted for the splice-then-insert semantics of moving
 * within the same array.
 */
export function attachColumnDragReorder(th, grip, colIdx, {
  getColumnCells, clearIndicators, onDrop,
}) {
  grip.draggable = true;

  grip.addEventListener('dragstart', (e) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/mep-column-index', String(colIdx));
    getColumnCells(colIdx).forEach((cell) => cell.classList.add('col-dragging'));
  });

  grip.addEventListener('dragend', () => {
    getColumnCells(colIdx).forEach((cell) => cell.classList.remove('col-dragging'));
    clearIndicators();
  });

  th.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const rect = th.getBoundingClientRect();
    const isRightHalf = (e.clientX - rect.left) > rect.width / 2;

    clearIndicators();
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
    clearIndicators();

    if (Number.isNaN(fromIdx) || fromIdx === colIdx) return;

    let toIdx = isAfter ? colIdx + 1 : colIdx;
    // The move splices the column out first, which shifts every index after
    // it down by one — compensate when dragging right.
    if (fromIdx < toIdx) toIdx -= 1;

    onDrop(fromIdx, toIdx);
  });
}

/**
 * Wires a row's drag handle for reorder-by-drag, mirroring
 * attachColumnDragReorder but for <tr> elements.
 */
export function attachRowDragReorder(tr, handle, rowIdx, { clearIndicators, onDrop }) {
  handle.draggable = true;

  handle.addEventListener('dragstart', (e) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(rowIdx));
    tr.classList.add('row-dragging');
  });

  handle.addEventListener('dragend', () => {
    tr.classList.remove('row-dragging');
    clearIndicators();
  });

  tr.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const rect = tr.getBoundingClientRect();
    const isBottomHalf = (e.clientY - rect.top) > rect.height / 2;

    clearIndicators();
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
    clearIndicators();

    if (Number.isNaN(fromIdx) || fromIdx === rowIdx) return;

    let toIdx = isAfter ? rowIdx + 1 : rowIdx;
    if (fromIdx < toIdx) toIdx -= 1;

    onDrop(fromIdx, toIdx);
  });
}

/**
 * Wires a row's bottom-edge resize handle to set an explicit row height.
 */
export function attachRowResize(handleEl, tr, onResize) {
  handleEl.addEventListener('mousedown', (e) => {
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
      if (newH !== startH) onResize(newH);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

/**
 * Textarea cell with auto-grow and a URL link button that appears when the
 * value looks like a URL.
 */
export function createTextCell(value, onChange) {
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
 * Plain single-line input cell.
 */
export function createInputCell(value, onChange) {
  const td = document.createElement('td');
  const input = document.createElement('input');
  input.className = 'cell-input cell-input-plain';
  input.type = 'text';
  input.value = value;
  input.addEventListener('change', (e) => onChange(e.target.value));
  td.append(input);
  return td;
}

/**
 * Dialog to add a new dynamic column. `isDuplicate(name)` validates the
 * proposed name; `onAdd(name)` commits it.
 */
export function showAddColumnDialog({
  title, placeholder, isDuplicate, onAdd,
}) {
  const overlay = document.createElement('div');
  overlay.className = 'mep-dialog-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'mep-dialog';

  const h3 = document.createElement('h3');
  h3.textContent = title;

  const field = document.createElement('div');
  field.className = 'mep-field';
  const label = document.createElement('label');
  label.className = 'mep-field-label';
  label.textContent = 'Column Name';
  const input = document.createElement('input');
  input.className = 'mep-input';
  input.type = 'text';
  input.placeholder = placeholder;
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
    if (isDuplicate(name)) {
      showError(`A column named "${name}" already exists.`);
      return;
    }
    onAdd(name);
    overlay.remove();
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

/**
 * Confirmation dialog to delete a column. `onDelete()` commits it.
 */
export function showDeleteColumnDialog({ colName, onDelete }) {
  const overlay = document.createElement('div');
  overlay.className = 'mep-dialog-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'mep-dialog';

  const h3 = document.createElement('h3');
  h3.textContent = 'Delete Column';

  const message = document.createElement('p');
  message.textContent = `Delete column "${colName}"? All values in this column will be lost for every row.`;

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
    onDelete();
    overlay.remove();
    document.removeEventListener('keydown', onKeydown);
  });

  document.addEventListener('keydown', onKeydown);

  actions.append(cancelBtn, deleteBtn);
  dialog.append(h3, message, actions);
  overlay.append(dialog);
  document.body.append(overlay);
}

/**
 * Dialog to rename a column. `isDuplicate(name)` validates the proposed name;
 * `onRename(name)` commits it and returns false if the model rejected it.
 */
export function showRenameColumnDialog({ currentName, isDuplicate, onRename }) {
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
  input.value = currentName;
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
    if (isDuplicate(name)) {
      showError(`A column named "${name}" already exists.`);
      return;
    }
    const ok = onRename(name);
    if (!ok) {
      showError('Could not rename this column.');
      return;
    }
    overlay.remove();
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
