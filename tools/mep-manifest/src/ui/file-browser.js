import { listFiles } from '../data/da-sheet-adapter.js';

/**
 * Derive extension from an item — uses item.ext if present,
 * otherwise parses the name/path.
 */
function getExt(item) {
  if (item.ext) return item.ext.toLowerCase();
  const name = item.name || item.path || '';
  const dot = name.lastIndexOf('.');
  return dot !== -1 ? name.slice(dot + 1).toLowerCase() : '';
}

/**
 * Format a lastModified value (ISO string or timestamp) into "DD Mon YYYY HH:MM".
 */
function formatDate(raw) {
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const mon = d.toLocaleString('en', { month: 'short' });
  const year = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${mon} ${year} ${hh}:${mm}`;
}

/**
 * File browser for navigating DA content and opening MEP manifest JSON files.
 * Mirrors the native DA file browser UI:
 *  - Single breadcrumb bar: org > site > path > NEW (pill chips)
 *  - Inline "new file" creation (no modal) — spaces replaced with hyphens
 *  - Column headers: NAME | MODIFIED
 *  - Folders: navigable
 *  - .json files (sheets/manifests): active, openable
 *  - Everything else (DA docs, html): grayed out / inactive
 */
export function renderFileBrowser(container, {
  org, site, startPath = '', onOpen, onNew,
}) {
  const wrap = document.createElement('div');
  wrap.className = 'mep-file-browser';
  container.append(wrap);

  let currentPath = startPath;

  function getPathSegments() {
    return currentPath ? currentPath.split('/').filter(Boolean) : [];
  }

  async function navigate(path) {
    currentPath = path;
    await renderBrowser();
  }

  /** Render the breadcrumb bar in normal mode. */
  function renderBreadcrumb(header) {
    header.innerHTML = '';

    // org — static label (non-clickable chip)
    const orgLabel = document.createElement('span');
    orgLabel.className = 'mep-crumb mep-crumb-static';
    orgLabel.textContent = org;
    header.append(orgLabel);

    // separator + site (clickable, navigates to root)
    const sep0 = document.createElement('span');
    sep0.className = 'mep-crumb-sep';
    sep0.textContent = '›';
    const siteCrumb = document.createElement('button');
    siteCrumb.className = 'mep-crumb';
    siteCrumb.textContent = site;
    siteCrumb.addEventListener('click', () => navigate(''));
    header.append(sep0, siteCrumb);

    // path segment chips
    getPathSegments().forEach((seg, idx, segs) => {
      const sep = document.createElement('span');
      sep.className = 'mep-crumb-sep';
      sep.textContent = '›';
      const crumb = document.createElement('button');
      crumb.className = 'mep-crumb';
      crumb.textContent = seg;
      crumb.addEventListener('click', () => {
        navigate(segs.slice(0, idx + 1).join('/'));
      });
      header.append(sep, crumb);
    });

    // NEW pill button
    const newSep = document.createElement('span');
    newSep.className = 'mep-crumb-sep';
    newSep.textContent = '›';
    const newBtn = document.createElement('button');
    newBtn.className = 'mep-fb-new-btn';
    newBtn.textContent = 'NEW';
    newBtn.addEventListener('click', () => renderNewMode(header));
    header.append(newSep, newBtn);
  }

  /** Replace NEW button with inline input + Create sheet / Cancel. */
  function renderNewMode(header) {
    // Remove last sep + NEW button
    header.lastElementChild.remove();
    header.lastElementChild.remove();

    const sep = document.createElement('span');
    sep.className = 'mep-crumb-sep';
    sep.textContent = '›';

    const input = document.createElement('input');
    input.className = 'mep-fb-new-input';
    input.type = 'text';
    input.placeholder = 'new-manifest';

    const createBtn = document.createElement('button');
    createBtn.className = 'mep-btn mep-btn-primary mep-fb-new-create';
    createBtn.textContent = 'Create sheet';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'mep-btn mep-fb-new-cancel';
    cancelBtn.textContent = 'Cancel';

    function doCreate() {
      const name = input.value.trim().replace(/\.json$/i, '');
      if (!name || name.includes('/')) {
        input.classList.add('mep-fb-input-error');
        input.focus();
        return;
      }
      const filePath = currentPath ? `${currentPath}/${name}.json` : `${name}.json`;
      renderBreadcrumb(header);
      onNew(filePath);
    }

    function doCancel() {
      renderBreadcrumb(header);
    }

    // Replace spaces with hyphens as the user types
    input.addEventListener('input', () => {
      const { selectionStart } = input;
      const replaced = input.value.replace(/ /g, '-');
      if (replaced !== input.value) {
        input.value = replaced;
        input.setSelectionRange(selectionStart, selectionStart);
      }
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doCreate();
      if (e.key === 'Escape') doCancel();
    });

    createBtn.addEventListener('click', doCreate);
    cancelBtn.addEventListener('click', doCancel);

    header.append(sep, input, createBtn, cancelBtn);
    requestAnimationFrame(() => input.focus());
  }

  async function renderBrowser() {
    wrap.innerHTML = '';

    // ---- Breadcrumb header ----
    const header = document.createElement('div');
    header.className = 'mep-file-browser-header';
    renderBreadcrumb(header);
    wrap.append(header);

    // ---- Column header row ----
    const colHeader = document.createElement('div');
    colHeader.className = 'mep-file-col-header';
    colHeader.innerHTML = '<span class="mep-file-col-check"></span>'
      + '<span class="mep-file-col-filter" title="Filter">&#9663;</span>'
      + '<span class="mep-file-col-name">NAME</span>'
      + '<span class="mep-file-col-modified">MODIFIED</span>';
    wrap.append(colHeader);

    // ---- File list ----
    const listEl = document.createElement('div');
    listEl.className = 'mep-file-list';

    const loading = document.createElement('div');
    loading.className = 'mep-empty';
    loading.innerHTML = '<span class="mep-empty-icon">⏳</span><span>Loading...</span>';
    listEl.append(loading);
    wrap.append(listEl);

    try {
      const items = await listFiles(org, site, currentPath);

      listEl.innerHTML = '';

      if (!items || items.length === 0) {
        listEl.innerHTML = '<div class="mep-empty"><span class="mep-empty-icon">📂</span><span>No files found</span></div>';
        return;
      }

      // Sort: folders first, then alphabetically
      const sorted = [...items].sort((a, b) => {
        const aExt = getExt(a);
        const bExt = getExt(b);
        const aIsFolder = !aExt;
        const bIsFolder = !bExt;
        if (aIsFolder && !bIsFolder) return -1;
        if (!aIsFolder && bIsFolder) return 1;
        return (a.name || a.path || '').localeCompare(b.name || b.path || '');
      });

      sorted.forEach((item) => {
        const ext = getExt(item);
        const isFolder = !ext;
        const isSheet = ext === 'json';
        const isActive = isFolder || isSheet;
        const name = item.name || item.path?.split('/').pop() || '';

        const row = document.createElement('div');
        row.className = [
          'mep-file-item',
          isFolder ? 'is-folder' : '',
          isSheet ? 'is-sheet' : '',
          !isActive ? 'is-inactive' : '',
        ].filter(Boolean).join(' ');

        // Visual checkbox (mirrors DA)
        const chk = document.createElement('span');
        chk.className = 'mep-file-item-check';

        const icon = document.createElement('span');
        icon.className = 'mep-file-item-icon';
        // eslint-disable-next-line no-nested-ternary
        icon.textContent = isFolder ? '📁' : isSheet ? '📊' : '📝';

        const nameEl = document.createElement('span');
        nameEl.className = 'mep-file-item-name';
        nameEl.textContent = name;

        const modEl = document.createElement('span');
        modEl.className = 'mep-file-modified';
        modEl.textContent = formatDate(item.lastModified || item.modified || item.lastmodified);

        row.append(chk, icon, nameEl, modEl);

        if (isFolder) {
          const chevron = document.createElement('span');
          chevron.className = 'mep-file-item-chevron';
          chevron.textContent = '›';
          row.append(chevron);
          row.addEventListener('click', () => {
            navigate(currentPath ? `${currentPath}/${name}` : name);
          });
        } else if (isSheet) {
          const openBtn = document.createElement('span');
          openBtn.className = 'mep-file-open-label';
          openBtn.textContent = 'Open';
          row.append(openBtn);
          row.addEventListener('click', () => {
            const fullName = (ext && !name.endsWith(`.${ext}`)) ? `${name}.${ext}` : name;
            onOpen(currentPath ? `${currentPath}/${fullName}` : fullName);
          });
        }

        listEl.append(row);
      });
    } catch (err) {
      listEl.innerHTML = `<div class="mep-empty"><span class="mep-empty-icon">⚠️</span><span>${err.message}</span></div>`;
    }
  }

  renderBrowser();
  return wrap;
}
