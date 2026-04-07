/**
 * Shows a result toast notification anchored below the toolbar.
 * Auto-dismisses after 8 seconds. Call dismiss() to remove early.
 *
 * @param {'success'|'error'} type
 * @param {string} title  — headline text
 * @param {string} [url]  — optional URL to show with Open + Copy buttons
 * @param {string} [detail] — optional secondary line (error message etc.)
 */
export function showToast(type, title, { url, detail } = {}) {
  // Remove any existing toast
  document.querySelector('.mep-toast')?.remove();

  const toast = document.createElement('div');
  toast.className = `mep-toast mep-toast-${type}`;

  // Header row: icon + title + close button
  const head = document.createElement('div');
  head.className = 'mep-toast-head';

  const icon = document.createElement('span');
  icon.className = 'mep-toast-icon';
  icon.textContent = type === 'success' ? '✓' : '✕';

  const titleEl = document.createElement('span');
  titleEl.className = 'mep-toast-title';
  titleEl.textContent = title;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'mep-toast-close';
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', () => toast.remove());

  head.append(icon, titleEl, closeBtn);
  toast.append(head);

  // URL row
  if (url) {
    const urlRow = document.createElement('div');
    urlRow.className = 'mep-toast-url-row';

    const urlText = document.createElement('span');
    urlText.className = 'mep-toast-url';
    urlText.textContent = url;
    urlText.title = url;

    urlRow.append(urlText);
    toast.append(urlRow);

    // Action buttons
    const actions = document.createElement('div');
    actions.className = 'mep-toast-actions';

    const openBtn = document.createElement('a');
    openBtn.className = 'mep-btn mep-btn-primary mep-toast-btn';
    openBtn.textContent = type === 'success' && title.toLowerCase().includes('publish') ? 'Open Live URL' : 'Open Preview';
    openBtn.href = url;
    openBtn.target = '_blank';
    openBtn.rel = 'noopener';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'mep-btn mep-toast-btn';
    copyBtn.textContent = 'Copy URL';
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(url).then(() => {
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy URL'; }, 2000);
      });
    });

    actions.append(openBtn, copyBtn);
    toast.append(actions);
  }

  // Detail / error message
  if (detail) {
    const detailEl = document.createElement('div');
    detailEl.className = 'mep-toast-detail';
    detailEl.textContent = detail;
    toast.append(detailEl);
  }

  document.body.append(toast);

  // Auto-dismiss after 8s for success, 12s for errors
  const ttl = type === 'success' ? 8000 : 12000;
  const timer = setTimeout(() => toast.remove(), ttl);
  closeBtn.addEventListener('click', () => clearTimeout(timer));

  return toast;
}
