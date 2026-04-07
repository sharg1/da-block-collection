import { MANIFEST_TYPES, EXECUTION_ORDERS } from '../data/manifest-model.js';

/**
 * Renders the Info tab with Manifest Type, Execution Order, Override Name.
 */
export function renderInfoTab(container, model) {
  const wrap = document.createElement('div');
  wrap.className = 'mep-tab-content';
  wrap.id = 'tab-info';
  wrap.style.display = 'none';

  const form = document.createElement('div');
  form.className = 'mep-info-form';

  // Manifest Type
  form.append(createSelectField(
    'Manifest Type',
    MANIFEST_TYPES,
    model.info.type,
    (val) => model.setInfo('type', val),
  ));

  // Execution Order
  form.append(createSelectField(
    'Execution Order',
    EXECUTION_ORDERS,
    model.info.executionOrder,
    (val) => model.setInfo('executionOrder', val),
  ));

  // Override Name
  form.append(createTextField(
    'Override Name',
    model.info.overrideName,
    (val) => model.setInfo('overrideName', val),
    'Optional — used for analytics override',
  ));

  wrap.append(form);
  container.append(wrap);
  return wrap;
}

function createSelectField(label, options, value, onChange) {
  const field = document.createElement('div');
  field.className = 'mep-field';

  const lbl = document.createElement('label');
  lbl.className = 'mep-field-label';
  lbl.textContent = label;

  const select = document.createElement('select');
  select.className = 'mep-select';
  options.forEach((opt) => {
    const option = document.createElement('option');
    option.value = opt;
    option.textContent = opt.charAt(0).toUpperCase() + opt.slice(1);
    if (opt === value) option.selected = true;
    select.append(option);
  });
  select.addEventListener('change', (e) => onChange(e.target.value));

  field.append(lbl, select);
  return field;
}

function createTextField(label, value, onChange, placeholder = '') {
  const field = document.createElement('div');
  field.className = 'mep-field';

  const lbl = document.createElement('label');
  lbl.className = 'mep-field-label';
  lbl.textContent = label;

  const input = document.createElement('input');
  input.className = 'mep-input';
  input.type = 'text';
  input.value = value;
  input.placeholder = placeholder;
  input.addEventListener('input', (e) => onChange(e.target.value));

  field.append(lbl, input);
  return field;
}
