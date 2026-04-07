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
 * File browser for navigating DA content and opening MEP manifest JSON files.
 * - Folders: navigable
 * - .json files (sheets/manifests): active, openable
 * - Everything else (DA docs, html): grayed out / inactive
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

  async function renderBrowser() {
    wrap.innerHTML = '';

    // ---- Header ----
    const header = document.createElement('div');
    header.className = 'mep-file-browser-header';

    const titleArea = document.createElement('div');
    titleArea.style.cssText = 'display:flex;flex-direction:column;gap:4px;';

    const title = document.createElement('h2');
    title.textContent = 'MEP Manifest Tool';

    // Breadcrumb
    const breadcrumb = document.createElement('div');
    breadcrumb.className = 'mep-breadcrumb';

    const rootCrumb = document.createElement('button');
    rootCrumb.className = 'mep-crumb';
    rootCrumb.textContent = site;
    rootCrumb.addEventListener('click', () => navigate(''));
    breadcrumb.append(rootCrumb);

    getPathSegments().forEach((seg, idx, segs) => {
      const sep = document.createElement('span');
      sep.className = 'mep-crumb-sep';
      sep.textContent = '/';

      const crumb = document.createElement('button');
      crumb.className = 'mep-crumb';
      crumb.textContent = seg;
      crumb.addEventListener('click', () => {
        navigate(segs.slice(0, idx + 1).join('/'));
      });
      breadcrumb.append(sep, crumb);
    });

    titleArea.append(title, breadcrumb);

    const newBtn = document.createElement('button');
    newBtn.className = 'mep-btn mep-btn-primary';
    newBtn.textContent = '+ New Manifest';
    newBtn.addEventListener('click', () => onNew(currentPath));

    header.append(titleArea, newBtn);
    wrap.append(header);

    // ---- Legend ----
    const legend = document.createElement('div');
    legend.className = 'mep-file-legend';
    legend.innerHTML = '<span class="mep-legend-sheet">● Sheet / Manifest</span>'
      + '<span class="mep-legend-doc">● DA Document (grayed out)</span>';
    wrap.append(legend);

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

        const icon = document.createElement('span');
        icon.className = 'mep-file-item-icon';
        // eslint-disable-next-line no-nested-ternary
        icon.textContent = isFolder ? '📁' : isSheet ? '📊' : '📝';

        const nameEl = document.createElement('span');
        nameEl.className = 'mep-file-item-name';
        nameEl.textContent = name;

        row.append(icon, nameEl);

        if (!isActive) {
          const typeLabel = document.createElement('span');
          typeLabel.className = 'mep-file-type-label';
          typeLabel.textContent = ext?.toUpperCase() || 'FILE';
          row.append(typeLabel);
        }

        if (isFolder) {
          const chevron = document.createElement('span');
          chevron.className = 'mep-crumb-sep';
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
