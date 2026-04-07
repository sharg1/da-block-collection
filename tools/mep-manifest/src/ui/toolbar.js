/**
 * Renders the top toolbar with Save, Preview, Publish, Close buttons.
 * Returns { toolbar, previewBtn, publishBtn } so callers can toggle loading state.
 */
export function renderToolbar(container, {
  onSave, onPreview, onPublish, onNew, onClose, model,
}) {
  const toolbar = document.createElement('div');
  toolbar.className = 'mep-toolbar';

  const left = document.createElement('div');
  left.className = 'mep-toolbar-left';

  if (onClose) {
    const backBtn = createButton('← Files', 'mep-btn', onClose);
    left.append(backBtn);
  }

  const title = document.createElement('span');
  title.className = 'mep-toolbar-title';
  title.textContent = model.filePath || 'New Manifest';
  left.append(title);

  const right = document.createElement('div');
  right.className = 'mep-toolbar-right';

  const newBtn = createButton('+ New', 'mep-btn', onNew);
  const saveBtn = createButton('Save', 'mep-btn', onSave);
  const previewBtn = createButton('Preview', 'mep-btn', onPreview);
  const publishBtn = createButton('Publish', 'mep-btn mep-btn-primary', onPublish);

  right.append(newBtn, saveBtn, previewBtn, publishBtn);
  toolbar.append(left, right);
  container.append(toolbar);

  model.onChange(() => {
    const path = model.filePath || 'New Manifest';
    title.textContent = model.dirty ? `${path} *` : path;
  });

  return { toolbar, previewBtn, publishBtn };
}

/**
 * Toggle a button between normal and loading state.
 * @param {HTMLButtonElement} btn
 * @param {boolean} loading
 * @param {string} [loadingText]
 */
export function setButtonLoading(btn, loading, loadingText = '') {
  // eslint-disable-next-line no-param-reassign
  btn.disabled = loading;
  if (loading) {
    btn.dataset.origText = btn.textContent;
    // eslint-disable-next-line no-param-reassign
    btn.textContent = loadingText || btn.textContent;
    btn.classList.add('mep-btn-loading');
  } else {
    // eslint-disable-next-line no-param-reassign
    btn.textContent = btn.dataset.origText || btn.textContent;
    btn.classList.remove('mep-btn-loading');
  }
}

function createButton(text, className, onClick) {
  const btn = document.createElement('button');
  btn.className = className;
  btn.textContent = text;
  btn.addEventListener('click', onClick);
  return btn;
}
