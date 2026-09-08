import {
  createResizableTh, attachColumnDragReorder, attachRowDragReorder, attachRowResize,
  createTextCell, createInputCell,
  showAddColumnDialog, showDeleteColumnDialog, showRenameColumnDialog,
} from './grid-helpers.js';

function isDuplicatePromoColumnName(model, name, excludeIdx = -1) {
  const trimmed = name.trim().toLowerCase();
  return model.promo.columns.some(
    (c, i) => i !== excludeIdx && c.name.toLowerCase() === trimmed,
  );
}

/**
 * Renders the flat Key/Value rows used for personalization and test
 * manifests — one value per key, no column concept.
 */
function renderFlatList(wrap, model, render) {
  const list = document.createElement('div');
  list.className = 'mep-placeholders';

  model.placeholders.forEach((ph, idx) => {
    const row = document.createElement('div');
    row.className = 'mep-placeholder-row';

    const keyInput = document.createElement('input');
    keyInput.className = 'mep-input';
    keyInput.type = 'text';
    keyInput.placeholder = 'Key';
    keyInput.value = ph.key;
    keyInput.addEventListener('change', (e) => {
      model.updatePlaceholder(idx, 'key', e.target.value);
    });

    const valInput = document.createElement('input');
    valInput.className = 'mep-input';
    valInput.type = 'text';
    valInput.placeholder = 'Value';
    valInput.value = ph.value;
    valInput.addEventListener('change', (e) => {
      model.updatePlaceholder(idx, 'value', e.target.value);
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'mep-btn mep-btn-icon';
    delBtn.textContent = '×';
    delBtn.title = 'Remove';
    delBtn.addEventListener('click', () => {
      model.removePlaceholder(idx);
      render();
    });

    row.append(keyInput, valInput, delBtn);
    list.append(row);
  });

  const addBtn = document.createElement('button');
  addBtn.className = 'mep-btn';
  addBtn.textContent = '+ Add Placeholder';
  addBtn.addEventListener('click', () => {
    model.addPlaceholder();
    render();
  });

  wrap.append(list, addBtn);
}

/**
 * Renders the Key + dynamic Value-columns grid used for promo manifests.
 * Mirrors the Experiences grid's column/row management (drag-to-reorder,
 * resize, add/rename/delete columns) via the shared grid-helpers.
 */
function renderPromoGrid(wrap, model, render, opts) {
  const gridWrapper = document.createElement('div');
  gridWrapper.className = 'mep-grid-wrapper';

  const table = document.createElement('table');
  table.className = 'mep-grid';

  const tbody = document.createElement('tbody');

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');

  headerRow.append(createResizableTh('#', 'col-handle'));
  headerRow.append(createResizableTh('Key', 'col-key', {
    savedWidth: model.promo.columnWidths.key,
    onResize: (w) => model.setPromoColumnWidth('key', w),
  }));

  // Fixed columns above occupy header/row positions 0-1; Value columns
  // start at position 2 — used to find each column's cells (header th +
  // every row's td) for drag indicator styling.
  const FIXED_COL_COUNT = 2;

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

  model.promo.columns.forEach((col, colIdx) => {
    const th = createResizableTh('', 'col-experience', {
      savedWidth: model.promo.columnWidths[col.name],
      onResize: (w) => model.setPromoColumnWidth(col.name, w),
    });

    const colNameLabel = document.createElement('span');
    colNameLabel.className = 'col-name-label';
    colNameLabel.textContent = col.name;
    colNameLabel.title = 'Double-click to rename';
    colNameLabel.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      showRenameColumnDialog({
        currentName: col.name,
        isDuplicate: (name) => isDuplicatePromoColumnName(model, name, colIdx),
        onRename: (name) => {
          const ok = model.renamePromoColumn(colIdx, name);
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
        model.movePromoColumn(fromIdx, toIdx);
        render();
      },
    });

    if (model.promo.columns.length > 1) {
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'col-delete-header-btn';
      deleteBtn.textContent = '×';
      deleteBtn.title = 'Delete column';
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showDeleteColumnDialog({
          colName: col.name,
          onDelete: () => {
            model.removePromoColumn(colIdx);
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
  addColTh.title = 'Add Value Column';
  addColTh.addEventListener('click', () => showAddColumnDialog({
    title: 'Add Value Column',
    placeholder: 'e.g., en, fr, headline',
    isDuplicate: (name) => isDuplicatePromoColumnName(model, name),
    onAdd: (name) => {
      model.addPromoColumn(name);
      render();
    },
  }));
  headerRow.append(addColTh);

  headerRow.append(createResizableTh('', 'col-handle'));

  thead.append(headerRow);
  table.append(thead);

  function clearDragIndicators() {
    tbody.querySelectorAll('tr').forEach((row) => {
      row.classList.remove('drag-insert-before', 'drag-insert-after');
    });
  }

  model.promo.rows.forEach((row, rowIdx) => {
    const tr = document.createElement('tr');

    const savedHeight = model.promo.rowHeights[rowIdx];
    if (Number.isFinite(savedHeight)) {
      tr.style.setProperty('--mep-row-height', `${savedHeight}px`);
      tr.classList.add('row-resized');
    }

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

    const rowResizeHandle = document.createElement('span');
    rowResizeHandle.className = 'mep-row-resize-handle';
    rowResizeHandle.title = 'Drag to resize row';
    attachRowResize(rowResizeHandle, tr, (newH) => model.setPromoRowHeight(rowIdx, newH));
    handleTd.append(rowResizeHandle);

    attachRowDragReorder(tr, handle, rowIdx, {
      clearIndicators: clearDragIndicators,
      onDrop: (fromIdx, toIdx) => {
        model.movePromoRow(fromIdx, toIdx);
        render();
      },
    });
    tr.append(handleTd);

    // Key cell — plain input
    tr.append(createInputCell(row.key, (val) => model.updatePromoRow(rowIdx, 'key', val)));

    // Value column cells — textarea with URL link button
    model.promo.columns.forEach((col) => {
      tr.append(createTextCell(
        row.values[col.name] || '',
        (val) => model.updatePromoRowValue(rowIdx, col.name, val),
      ));
    });

    const spacerTd = document.createElement('td');
    spacerTd.style.border = 'none';
    spacerTd.style.background = 'transparent';
    tr.append(spacerTd);

    const deleteTd = document.createElement('td');
    deleteTd.className = 'col-delete';
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '×';
    deleteBtn.title = 'Delete row';
    deleteBtn.addEventListener('click', () => { model.removePromoRow(rowIdx); render(); });
    deleteTd.append(deleteBtn);
    tr.append(deleteTd);

    tbody.append(tr);
  });

  table.append(tbody);
  gridWrapper.append(table);
  wrap.append(gridWrapper);

  const footer = document.createElement('div');
  footer.className = 'mep-grid-footer';
  const addRowBtn = document.createElement('button');
  addRowBtn.className = 'mep-btn';
  addRowBtn.textContent = '+ Add Row';
  addRowBtn.addEventListener('click', () => { model.addPromoRow(); render({ revealLastRow: true }); });
  footer.append(addRowBtn);
  wrap.append(footer);

  requestAnimationFrame(() => {
    if (opts.revealLastRow) {
      gridWrapper.scrollTop = gridWrapper.scrollHeight;
      const lastTr = tbody.querySelector('tr:last-child');
      const field = lastTr && lastTr.querySelector('textarea, input');
      if (field) field.focus({ preventScroll: true });
    }
  });
}

/**
 * Renders the Placeholders tab. For personalization/test manifests this is
 * flat Key/Value rows; for promo manifests it's a Key + dynamic Value-columns
 * grid (similar to the Experiences grid).
 */
export function renderPlaceholdersTab(container, model) {
  const wrap = document.createElement('div');
  wrap.className = 'mep-tab-content';
  wrap.id = 'tab-placeholders';
  wrap.style.display = 'none';

  // ---- Info bar (built once, outside render()) ----
  // Mirrors the Manifest Type selector on the Experiences tab so switching
  // between the flat placeholder list and the promo grid is discoverable
  // from this tab too, without having to jump elsewhere. Both selectors
  // read/write the same model.info.type — "Placeholder" collapses
  // personalization/test into one option since this tab only distinguishes
  // promo vs. non-promo.
  const infoBar = document.createElement('div');
  infoBar.className = 'mep-info-bar';

  const typeField = document.createElement('div');
  typeField.className = 'mep-field';
  const typeLabel = document.createElement('label');
  typeLabel.className = 'mep-field-label';
  typeLabel.textContent = 'Type';
  const typeSelect = document.createElement('select');
  typeSelect.className = 'mep-select';
  [['placeholder', 'Placeholder'], ['promo', 'Promo']].forEach(([value, label]) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    typeSelect.append(opt);
  });
  typeSelect.addEventListener('change', (e) => {
    if (e.target.value === 'promo') {
      model.setInfo('type', 'promo');
    } else if (model.info.type === 'promo') {
      model.setInfo('type', 'personalization');
    }
  });
  typeField.append(typeLabel, typeSelect);
  infoBar.append(typeField);
  wrap.append(infoBar);

  function render(opts = {}) {
    const isPromo = model.info.type === 'promo';
    typeSelect.value = isPromo ? 'promo' : 'placeholder';

    // Remove everything after the info bar
    while (wrap.lastChild !== infoBar) wrap.removeChild(wrap.lastChild);

    wrap.classList.toggle('mep-grid-mode', isPromo);
    if (isPromo) {
      renderPromoGrid(wrap, model, render, opts);
    } else {
      renderFlatList(wrap, model, render);
    }
  }

  // The Manifest Type selector on the Experiences tab writes the same
  // model.info.type; when it changes there, re-render here too so both
  // selectors and this tab's content stay in sync. Guarded on type actually
  // changing so edits elsewhere in the model (which also call emit()) don't
  // trigger a redundant rebuild.
  let lastType = model.info.type;
  model.onChange(() => {
    if (model.info.type !== lastType) {
      lastType = model.info.type;
      render();
    }
  });

  render();
  container.append(wrap);
  return { el: wrap, refresh: render };
}
