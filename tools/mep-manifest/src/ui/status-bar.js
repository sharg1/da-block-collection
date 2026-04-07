/**
 * Renders a status bar at the bottom of the app.
 */
export function renderStatusBar(container, model) {
  const bar = document.createElement('div');
  bar.className = 'mep-status';
  bar.textContent = 'Ready';

  model.onChange(() => {
    bar.textContent = model.dirty ? 'Unsaved changes' : 'Saved';
    bar.className = `mep-status ${model.dirty ? 'mep-status-unsaved' : 'mep-status-saved'}`;
  });

  container.append(bar);
  return bar;
}

export function setStatus(bar, text, type = '') {
  bar.textContent = text;
  bar.className = `mep-status ${type ? `mep-status-${type}` : ''}`;
}
