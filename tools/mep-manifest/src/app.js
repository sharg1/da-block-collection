import { ManifestModel } from './data/manifest-model.js';
import { openManifest, saveManifest, previewManifest, publishManifest, setToken } from './data/da-sheet-adapter.js';
import { renderFileBrowser } from './ui/file-browser.js';
import { renderToolbar, setButtonLoading } from './ui/toolbar.js';
import { renderTabNav } from './ui/tab-nav.js';
import { renderPlaceholdersTab } from './ui/placeholders-tab.js';
import { renderExperiencesTab } from './ui/experiences-tab.js';
import { renderStatusBar, setStatus } from './ui/status-bar.js';
import { showToast } from './ui/toast.js';

let model = ManifestModel.createNew();
let statusBar;
let sdk = {};
let tabs = {};
let appContainer;
let previewBtn;
let publishBtn;

function getOrgSite() {
  const { org, repo } = sdk.context || {};
  return { org: org || '', site: repo || '' };
}

/* ---- New Manifest Modal ---- */

function showNewManifestDialog(prefillPath, onConfirm) {
  // Prevent duplicate dialogs
  if (document.querySelector('.mep-new-manifest-dialog')) return;

  const overlay = document.createElement('div');
  overlay.className = 'mep-dialog-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'mep-dialog mep-new-manifest-dialog';

  const h3 = document.createElement('h3');
  h3.textContent = 'New Manifest';

  // Location field
  const locationField = document.createElement('div');
  locationField.className = 'mep-field';
  const locationLabel = document.createElement('label');
  locationLabel.className = 'mep-field-label';
  locationLabel.textContent = 'Location (folder)';
  const locationInput = document.createElement('input');
  locationInput.className = 'mep-input';
  locationInput.type = 'text';
  locationInput.placeholder = 'e.g., fragments/tests';
  locationInput.value = prefillPath || '';
  locationField.append(locationLabel, locationInput);

  // Name field
  const nameField = document.createElement('div');
  nameField.className = 'mep-field';
  const nameLabel = document.createElement('label');
  nameLabel.className = 'mep-field-label';
  nameLabel.textContent = 'Name (no extension)';
  const nameInput = document.createElement('input');
  nameInput.className = 'mep-input';
  nameInput.type = 'text';
  nameInput.placeholder = 'my-manifest';
  nameField.append(nameLabel, nameInput);

  const errorMsg = document.createElement('p');
  errorMsg.className = 'mep-dialog-error';
  errorMsg.style.cssText = 'color:var(--mep-danger);font-size:12px;margin-top:4px;display:none';

  const actions = document.createElement('div');
  actions.className = 'mep-dialog-actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'mep-btn';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => overlay.remove());

  const createBtn = document.createElement('button');
  createBtn.className = 'mep-btn mep-btn-primary';
  createBtn.textContent = 'Create';
  createBtn.addEventListener('click', () => {
    const name = nameInput.value.trim();
    if (!name) {
      errorMsg.textContent = 'Name is required.';
      errorMsg.style.display = '';
      nameInput.focus();
      return;
    }
    const folder = locationInput.value.trim().replace(/^\/|\/$/g, '');
    const filePath = folder ? `${folder}/${name}.json` : `${name}.json`;
    overlay.remove();
    onConfirm(filePath);
  });

  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') overlay.remove();
    if (e.key === 'Enter' && document.activeElement !== cancelBtn) createBtn.click();
  });

  actions.append(cancelBtn, createBtn);
  dialog.append(h3, locationField, nameField, errorMsg, actions);
  overlay.append(dialog);
  document.body.append(overlay);

  requestAnimationFrame(() => nameInput.focus());
}

/* ---- File browser ---- */

function showFileBrowser() {
  appContainer.innerHTML = '';
  const { org, site } = getOrgSite();
  renderFileBrowser(appContainer, {
    org,
    site,
    startPath: '',
    onOpen: (path) => handleOpen(path),
    onNew: (folderPath) => handleNew(folderPath),
  });
}

/* ---- Editor actions ---- */

async function handleSave() {
  const { org, site } = getOrgSite();
  const sheetData = model.toSheet();

  try {
    setStatus(statusBar, 'Saving...', '');
    await saveManifest(org, site, model.filePath, sheetData);
    model.markClean();
    model.emit();
    setStatus(statusBar, 'Saved', 'saved');
  } catch (err) {
    setStatus(statusBar, `Save failed: ${err.message}`, 'unsaved');
  }
}

async function handlePreview() {
  if (!model.filePath) {
    // eslint-disable-next-line no-alert
    alert('Please save the manifest first.');
    return;
  }
  await handleSave();
  const { org, site } = getOrgSite();
  setButtonLoading(previewBtn, true, 'Previewing…');
  setStatus(statusBar, 'Generating preview…', '');
  try {
    await previewManifest(org, site, model.filePath);
    const pagePath = model.filePath.replace(/\.[^/.]+$/, '');
    const url = `https://main--${site}--${org}.aem.page/${pagePath}`;
    setStatus(statusBar, 'Preview ready', 'saved');
    showToast('success', 'Preview generated', { url });
  } catch (err) {
    setStatus(statusBar, `Preview failed: ${err.message}`, 'unsaved');
    showToast('error', 'Preview failed', { detail: err.message });
  } finally {
    setButtonLoading(previewBtn, false);
  }
}

async function handlePublish() {
  if (!model.filePath) {
    // eslint-disable-next-line no-alert
    alert('Please save the manifest first.');
    return;
  }
  await handleSave();
  const { org, site } = getOrgSite();
  setButtonLoading(publishBtn, true, 'Publishing…');
  setStatus(statusBar, 'Publishing…', '');
  try {
    await publishManifest(org, site, model.filePath);
    const pagePath = model.filePath.replace(/\.[^/.]+$/, '');
    const url = `https://main--${site}--${org}.aem.live/${pagePath}`;
    setStatus(statusBar, 'Published', 'saved');
    showToast('success', 'Published to live', { url });
  } catch (err) {
    setStatus(statusBar, `Publish failed: ${err.message}`, 'unsaved');
    showToast('error', 'Publish failed', { detail: err.message });
  } finally {
    setButtonLoading(publishBtn, false);
  }
}

function handleNew(prefillPath = '') {
  // eslint-disable-next-line no-restricted-globals, no-alert
  if (model.dirty && !confirm('Discard unsaved changes?')) return;
  showNewManifestDialog(prefillPath, (filePath) => {
    model = ManifestModel.createNew();
    model.filePath = filePath;
    renderEditor();
  });
}

function handleClose() {
  // eslint-disable-next-line no-restricted-globals, no-alert
  if (model.dirty && !confirm('Discard unsaved changes?')) return;
  model = ManifestModel.createNew();
  showFileBrowser();
}

async function handleOpen(path) {
  const { org, site } = getOrgSite();
  try {
    const data = await openManifest(org, site, path);
    model = new ManifestModel();
    model.filePath = path;
    if (data) model.fromSheet(data);
    renderEditor();
  } catch (err) {
    // eslint-disable-next-line no-alert
    alert(`Could not open file: ${err.message}`);
  }
}

function switchTab(tabId) {
  Object.keys(tabs).forEach((id) => {
    const tabEl = tabs[id]?.el || tabs[id];
    if (tabEl) tabEl.style.display = id === tabId ? '' : 'none';
  });
}

/* ---- Render ---- */

function renderEditor() {
  appContainer.innerHTML = '';

  // Derive folder from current file path for the toolbar "+ New" button
  const currentFolder = model.filePath
    ? model.filePath.slice(0, model.filePath.lastIndexOf('/'))
    : '';

  ({ previewBtn, publishBtn } = renderToolbar(appContainer, {
    onSave: handleSave,
    onPreview: handlePreview,
    onPublish: handlePublish,
    onNew: () => handleNew(currentFolder),
    onClose: handleClose,
    model,
  }));

  renderTabNav(appContainer, switchTab);

  const experiencesTab = renderExperiencesTab(appContainer, model);
  const placeholdersResult = renderPlaceholdersTab(appContainer, model);

  tabs = {
    experiences: experiencesTab,
    placeholders: placeholdersResult,
  };

  // Hide non-active tabs
  switchTab('experiences');

  statusBar = renderStatusBar(appContainer, model);
}

export function initApp(container, sdkData) {
  sdk = sdkData;
  appContainer = container;
  setToken(sdk.token);

  // Check URL for a direct file path to auto-open
  const urlParams = new URLSearchParams(window.location.search);
  const openPath = urlParams.get('path');
  if (openPath) {
    handleOpen(openPath);
  } else {
    showFileBrowser();
  }
}
