/**
 * Renders the Placeholders tab with key/value rows.
 */
export function renderPlaceholdersTab(container, model) {
  const wrap = document.createElement('div');
  wrap.className = 'mep-tab-content';
  wrap.id = 'tab-placeholders';
  wrap.style.display = 'none';

  function render() {
    wrap.innerHTML = '';
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
      delBtn.textContent = '\u00D7';
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

  render();
  container.append(wrap);
  return { el: wrap, refresh: render };
}
