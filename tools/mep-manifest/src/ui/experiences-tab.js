import { ACTIONS, MANIFEST_TYPES, EXECUTION_ORDERS } from '../data/manifest-model.js';

// Maps action name → CSS class for the action <td> left-border accent
const ACTION_CSS_MAP = {
  insertContentAfter: 'action-insertcontentafter',
  replaceContent: 'action-replacecontent',
  remove: 'action-remove',
  insertContentBefore: 'action-insertcontentbefore',
  replaceFragment: 'action-replacefragment',
  appendToSection: 'action-appendtosection',
};

// Maps action name → CSS class applied to the entire <tr> for row background
const ROW_CSS_MAP = {
  insertContentAfter: 'row-insertcontentafter',
  replaceContent: 'row-replacecontent',
  remove: 'row-remove',
  insertContentBefore: 'row-insertcontentbefore',
  replaceFragment: 'row-replacefragment',
  appendToSection: 'row-appendtosection',
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
    opt.textContent = t;
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
    // Remove everything after the info bar
    while (wrap.lastChild !== infoBar) wrap.removeChild(wrap.lastChild);

    const gridWrapper = document.createElement('div');
    gridWrapper.className = 'mep-grid-wrapper';

    const table = document.createElement('table');
    table.className = 'mep-grid';

    // Header
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');

    headerRow.append(createTh('#', 'col-handle'));
    headerRow.append(createTh('Action', 'col-action', true));
    headerRow.append(createTh('Selector', 'col-selector', true));
    headerRow.append(createTh('Page Filter', 'col-page-filter', true));

    model.experiences.columns.forEach((col) => {
      const isTarget = col.name.toLowerCase().startsWith('target');
      headerRow.append(createTh(col.name, `col-experience${isTarget ? ' target' : ''}`, true));
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
    const tbody = document.createElement('tbody');

    model.experiences.rows.forEach((row, rowIdx) => {
      const tr = document.createElement('tr');

      // Apply row background color class if action is set
      if (row.action && ROW_CSS_MAP[row.action]) {
        tr.classList.add(ROW_CSS_MAP[row.action]);
      }

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
 */
function createTh(text, className, resizable = false) {
  const th = document.createElement('th');
  th.className = className;
  th.textContent = text;

  if (resizable) {
    const handle = document.createElement('span');
    handle.className = 'mep-col-resize-handle';
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = th.offsetWidth;

      function onMove(me) {
        const newW = Math.max(60, startW + (me.clientX - startX));
        th.style.width = `${newW}px`;
        th.style.minWidth = `${newW}px`;
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
    th.append(handle);
  }

  return th;
}

/**
 * Action dropdown cell — applies left-border accent to the <td>
 * and row background class to the parent <tr>.
 */
function createActionCell(row, rowIdx, model, tr) {
  const td = document.createElement('td');
  td.className = 'action-cell';
  if (row.action && ACTION_CSS_MAP[row.action]) td.classList.add(ACTION_CSS_MAP[row.action]);

  const select = document.createElement('select');
  select.className = 'action-select';

  const emptyOpt = document.createElement('option');
  emptyOpt.value = '';
  emptyOpt.textContent = '— Select Action —';
  select.append(emptyOpt);

  ACTIONS.forEach((action) => {
    const opt = document.createElement('option');
    opt.value = action;
    opt.textContent = action;
    if (action === row.action) opt.selected = true;
    select.append(opt);
  });

  select.addEventListener('change', (e) => {
    model.updateRow(rowIdx, 'action', e.target.value);

    // Update <td> left-border accent
    Object.values(ACTION_CSS_MAP).forEach((cls) => td.classList.remove(cls));
    if (e.target.value && ACTION_CSS_MAP[e.target.value]) {
      td.classList.add(ACTION_CSS_MAP[e.target.value]);
    }

    // Update <tr> row background
    Object.values(ROW_CSS_MAP).forEach((cls) => tr.classList.remove(cls));
    if (e.target.value && ROW_CSS_MAP[e.target.value]) {
      tr.classList.add(ROW_CSS_MAP[e.target.value]);
    }
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
  field.append(label, input);

  const actions = document.createElement('div');
  actions.className = 'mep-dialog-actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'mep-btn';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => overlay.remove());

  const addBtn = document.createElement('button');
  addBtn.className = 'mep-btn mep-btn-primary';
  addBtn.textContent = 'Add';
  addBtn.addEventListener('click', () => {
    const name = input.value.trim();
    if (name) {
      model.addColumn(name);
      overlay.remove();
      refreshFn();
    }
  });

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
