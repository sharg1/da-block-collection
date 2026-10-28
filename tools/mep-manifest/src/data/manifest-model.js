/**
 * MEP Manifest data model.
 * Holds all manifest data and emits change events.
 */

const ACTIONS = [
  'remove',
  'replace',
  'insertBefore',
  'insertAfter',
  'prependToSection',
  'appendToSection',
  'replacePage',
  'useBlockCode',
  'insertScript',
  'updateMetadata',
];

const MANIFEST_TYPES = ['personalization', 'test', 'promo'];
const EXECUTION_ORDERS = ['First', 'Normal', 'Last'];
const CONSENT_TYPES = [
  'Promo or No Offer Changes',
  'Non-Personalized Offer Test',
  'Personalized Offer',
];

export {
  ACTIONS,
  MANIFEST_TYPES,
  EXECUTION_ORDERS,
  CONSENT_TYPES,
};

export class ManifestModel {
  constructor() {
    this.info = {
      type: 'personalization',
      executionOrder: 'Normal',
      overrideName: '',
      consentType: '',
    };
    this.placeholders = [];
    this.experiences = {
      columns: [],
      rows: [],
      // Editor-only cell sizing, persisted in a hidden "private-layout" sheet
      // so it round-trips through the same DA file but never reaches the
      // previewed/published output. columnWidths is keyed by stable column id
      // ('action'/'selector'/'pageFilter' for the fixed columns, col.name for
      // experience columns); rowHeights is parallel to rows (null = unset).
      columnWidths: {},
      rowHeights: [],
    };
    // Grid-shaped placeholders used when info.type === 'promo': a fixed Key
    // column plus any number of named Value columns per row. Kept alongside
    // (not replacing) `placeholders` so switching manifest type never loses
    // either sheet's data.
    this.promo = {
      columns: [],
      rows: [],
      columnWidths: {},
      rowHeights: [],
    };
    this.dirty = false;
    this.listeners = [];
    this.filePath = '';
    // True when this manifest was loaded from the old pre-migration DA
    // schema (capitalized Action/Selector/Key/Value, no columns array) —
    // drives the "Migrate" affordance in the toolbar. Not persisted.
    this.isLegacyFormat = false;
  }

  onChange(fn) {
    this.listeners.push(fn);
  }

  emit() {
    this.dirty = true;
    this.listeners.forEach((fn) => fn(this));
  }

  /**
   * Notifies listeners without marking the model dirty — for refreshing
   * the UI after something that isn't a user edit (e.g. after a save, or
   * after clearing a UI-only flag like isLegacyFormat). Using emit() here
   * would immediately re-dirty a model that was just markClean()'d.
   */
  notify() {
    this.listeners.forEach((fn) => fn(this));
  }

  /* ---- Info ---- */

  setInfo(key, value) {
    this.info[key] = value;
    this.emit();
  }

  /* ---- Placeholders ---- */

  addPlaceholder(key = '', value = '') {
    this.placeholders.push({ key, value });
    this.emit();
  }

  updatePlaceholder(idx, field, value) {
    this.placeholders[idx][field] = value;
    this.emit();
  }

  removePlaceholder(idx) {
    this.placeholders.splice(idx, 1);
    this.emit();
  }

  /* ---- Experience Columns ---- */

  addColumn(name, isDefault = false) {
    this.insertColumn(this.experiences.columns.length, name, isDefault);
  }

  removeColumn(idx) {
    const col = this.experiences.columns[idx];
    if (!col || col.isDefault) return;
    if (this.experiences.columns.length <= 1) return;
    this.experiences.columns.splice(idx, 1);
    this.experiences.rows.forEach((row) => {
      delete row.values[col.name];
    });
    delete this.experiences.columnWidths[col.name];
    this.emit();
  }

  renameColumn(idx, newName) {
    const col = this.experiences.columns[idx];
    const trimmed = newName.trim();
    if (!trimmed) return false;
    const isDuplicate = this.experiences.columns.some(
      (c, i) => i !== idx && c.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (isDuplicate) return false;
    if (trimmed === col.name) return true;
    const oldName = col.name;
    col.name = trimmed;
    this.experiences.rows.forEach((row) => {
      row.values[trimmed] = row.values[oldName];
      delete row.values[oldName];
    });
    if (Object.prototype.hasOwnProperty.call(this.experiences.columnWidths, oldName)) {
      this.experiences.columnWidths[trimmed] = this.experiences.columnWidths[oldName];
      delete this.experiences.columnWidths[oldName];
    }
    this.emit();
    return true;
  }

  moveColumn(fromIdx, toIdx) {
    const [col] = this.experiences.columns.splice(fromIdx, 1);
    this.experiences.columns.splice(toIdx, 0, col);
    this.emit();
  }

  insertColumn(idx, name, isDefault = false) {
    const trimmed = name.trim();
    const reserved = ['action', 'selector', 'page filter', 'pagefilter', 'page filter (optional)', '__proto__', 'constructor', 'prototype'];
    if (!Number.isInteger(idx) || idx < 0 || idx > this.experiences.columns.length) {
      throw new Error('The column insertion position is invalid.');
    }
    if (!trimmed || reserved.includes(trimmed.toLowerCase())) {
      throw new Error('Enter an experience name that is not a fixed column name or reserved key.');
    }
    if (this.experiences.columns.some((col) => col.name.toLowerCase() === trimmed.toLowerCase())) {
      throw new Error(`A column named "${trimmed}" already exists.`);
    }
    this.experiences.columns.splice(idx, 0, { name: trimmed, isDefault });
    this.experiences.rows.forEach((row) => {
      row.values[trimmed] = '';
    });
    this.emit();
  }

  copyColumn(idx) {
    const col = this.experiences.columns[idx];
    if (!col) throw new Error('The column to copy no longer exists.');
    return this.experiences.rows.map((row) => row.values[col.name] ?? '');
  }

  pasteColumn(idx, values) {
    const col = this.experiences.columns[idx];
    if (!col) throw new Error('The destination column no longer exists.');
    if (!Array.isArray(values)) throw new Error('Copy an experience column before pasting.');
    this.experiences.rows.forEach((row, rowIdx) => {
      row.values[col.name] = values[rowIdx] ?? '';
    });
    this.emit();
  }

  /* ---- Experience Rows ---- */

  addRow() {
    this.insertRow(this.experiences.rows.length);
  }

  updateRow(rowIdx, field, value) {
    this.experiences.rows[rowIdx][field] = value;
    this.emit();
  }

  updateRowValue(rowIdx, colName, value) {
    this.experiences.rows[rowIdx].values[colName] = value;
    this.emit();
  }

  removeRow(idx) {
    this.experiences.rows.splice(idx, 1);
    this.experiences.rowHeights.splice(idx, 1);
    this.emit();
  }

  moveRow(fromIdx, toIdx) {
    const [row] = this.experiences.rows.splice(fromIdx, 1);
    this.experiences.rows.splice(toIdx, 0, row);
    const [height] = this.experiences.rowHeights.splice(fromIdx, 1);
    this.experiences.rowHeights.splice(toIdx, 0, height);
    this.emit();
  }

  insertRow(idx) {
    if (!Number.isInteger(idx) || idx < 0 || idx > this.experiences.rows.length) {
      throw new Error('The row insertion position is invalid.');
    }
    const values = Object.fromEntries(this.experiences.columns.map((col) => [col.name, '']));
    this.experiences.rows.splice(idx, 0, {
      action: '', selector: '', pageFilter: '', values,
    });
    this.experiences.rowHeights.splice(idx, 0, null);
    this.emit();
  }

  copyRow(idx) {
    const row = this.experiences.rows[idx];
    if (!row) throw new Error('The row to copy no longer exists.');
    return { ...row, values: { ...row.values } };
  }

  pasteRow(idx, snapshot) {
    if (!this.experiences.rows[idx]) throw new Error('The destination row no longer exists.');
    if (!snapshot || !snapshot.values) throw new Error('Copy a row before pasting.');
    const values = Object.fromEntries(
      this.experiences.columns.map((col) => [col.name, snapshot.values[col.name] ?? '']),
    );
    this.experiences.rows[idx] = {
      action: snapshot.action,
      selector: snapshot.selector,
      pageFilter: snapshot.pageFilter,
      values,
    };
    this.emit();
  }

  /* ---- Cell sizing (editor-only, persisted via private-layout sheet) ---- */

  setColumnWidth(id, px) {
    this.experiences.columnWidths[id] = px;
    this.emit();
  }

  setRowHeight(idx, px) {
    this.experiences.rowHeights[idx] = px;
    this.emit();
  }

  /* ---- Promo Placeholder Columns ---- */

  addPromoColumn(name) {
    this.promo.columns.push({ name });
    this.promo.rows.forEach((row) => {
      row.values[name] = '';
    });
    this.emit();
  }

  removePromoColumn(idx) {
    const col = this.promo.columns[idx];
    if (!col) return;
    if (this.promo.columns.length <= 1) return;
    this.promo.columns.splice(idx, 1);
    this.promo.rows.forEach((row) => {
      delete row.values[col.name];
    });
    delete this.promo.columnWidths[col.name];
    this.emit();
  }

  renamePromoColumn(idx, newName) {
    const col = this.promo.columns[idx];
    const trimmed = newName.trim();
    if (!trimmed) return false;
    const isDuplicate = this.promo.columns.some(
      (c, i) => i !== idx && c.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (isDuplicate) return false;
    if (trimmed === col.name) return true;
    const oldName = col.name;
    col.name = trimmed;
    this.promo.rows.forEach((row) => {
      row.values[trimmed] = row.values[oldName];
      delete row.values[oldName];
    });
    if (Object.prototype.hasOwnProperty.call(this.promo.columnWidths, oldName)) {
      this.promo.columnWidths[trimmed] = this.promo.columnWidths[oldName];
      delete this.promo.columnWidths[oldName];
    }
    this.emit();
    return true;
  }

  movePromoColumn(fromIdx, toIdx) {
    const [col] = this.promo.columns.splice(fromIdx, 1);
    this.promo.columns.splice(toIdx, 0, col);
    this.emit();
  }

  /* ---- Promo Placeholder Rows ---- */

  addPromoRow() {
    const values = {};
    this.promo.columns.forEach((col) => {
      values[col.name] = '';
    });
    this.promo.rows.push({ key: '', values });
    this.promo.rowHeights.push(null);
    this.emit();
  }

  updatePromoRow(rowIdx, field, value) {
    this.promo.rows[rowIdx][field] = value;
    this.emit();
  }

  updatePromoRowValue(rowIdx, colName, value) {
    this.promo.rows[rowIdx].values[colName] = value;
    this.emit();
  }

  removePromoRow(idx) {
    this.promo.rows.splice(idx, 1);
    this.promo.rowHeights.splice(idx, 1);
    this.emit();
  }

  movePromoRow(fromIdx, toIdx) {
    const [row] = this.promo.rows.splice(fromIdx, 1);
    this.promo.rows.splice(toIdx, 0, row);
    const [height] = this.promo.rowHeights.splice(fromIdx, 1);
    this.promo.rowHeights.splice(toIdx, 0, height);
    this.emit();
  }

  setPromoColumnWidth(id, px) {
    this.promo.columnWidths[id] = px;
    this.emit();
  }

  setPromoRowHeight(idx, px) {
    this.promo.rowHeights[idx] = px;
    this.emit();
  }

  /* ---- Serialization: to/from DA sheet format ---- */

  /**
   * Load from DA multi-sheet JSON format. Matches the schema produced by the
   * legacy SharePoint-based tool: lowercase "key"/"value" on info and
   * placeholders, lowercase "action"/"selector"/"page filter (optional)" on
   * experiences. Also accepts the older capitalized "Key"/"Value"/"Action"/
   * "Selector"/"Page Filter" keys this tool itself used to write, so
   * previously-saved manifests keep loading correctly.
   * Expected structure:
   * {
   *   ":names": ["experiences", "info", "placeholders"],
   *   "info": { "data": [{ "key": "...", "value": "..." }, ...] },
   *   "placeholders": { "data": [{ "key": "...", "value": "..." }, ...] },
   *   "experiences": { "data": [{ "action": "...", "selector": "...", ... }, ...] }
   * }
   */
  fromSheet(sheetData) {
    if (!sheetData) return;

    // Detect the old pre-migration DA schema by the actual row data casing
    // (capitalized "Key"/"Action"), not by a "columns" array — DA's Admin
    // API does not reliably round-trip metadata fields like columns, but it
    // always round-trips the row data itself, which is what this checks.
    const firstInfoRow = sheetData.info?.data?.[0];
    const firstExpRow = sheetData.experiences?.data?.[0];
    this.isLegacyFormat = (
      (!!firstInfoRow && Object.prototype.hasOwnProperty.call(firstInfoRow, 'Key'))
      || (!!firstExpRow && Object.prototype.hasOwnProperty.call(firstExpRow, 'Action'))
    );

    // Load info
    const infoData = sheetData.info?.data || sheetData[':names']?.includes('info')
      ? (sheetData.info?.data || [])
      : [];
    infoData.forEach((row) => {
      const rawKey = row.Key ?? row.key ?? '';
      const rawValue = row.Value ?? row.value ?? '';
      const key = rawKey.toLowerCase().replace(/\s+/g, '');
      if (key === 'manifesttype' || key === 'manifest-type') this.info.type = rawValue || 'personalization';
      if (key === 'executionorder' || key === 'execution-order' || key === 'manifest-execution-order') this.info.executionOrder = rawValue || 'Normal';
      if (key === 'overridename' || key === 'override-name' || key === 'manifest-override-name') this.info.overrideName = rawValue || '';
      if (key === 'manifest-consent-type') this.info.consentType = rawValue || '';
    });

    // Load placeholders
    const phData = sheetData.placeholders?.data || [];
    this.placeholders = phData.map((row) => ({
      key: row.Key ?? row.key ?? '',
      value: row.Value ?? row.value ?? '',
    }));

    // Load experiences
    const expData = sheetData.experiences?.data || sheetData.data || [];
    if (expData.length > 0) {
      // Case-insensitive key lookup
      const getVal = (row, key) => {
        const lk = key.toLowerCase();
        const found = Object.keys(row).find((k) => k.toLowerCase() === lk);
        return found ? (row[found] || '') : '';
      };

      // Discover columns from first row keys, excluding fixed ones
      const fixedCols = ['action', 'selector', 'page filter', 'pagefilter', 'page filter (optional)'];
      const allKeys = Object.keys(expData[0]);
      const expColNames = allKeys.filter((k) => !fixedCols.includes(k.toLowerCase()));

      this.experiences.columns = expColNames.map((name) => ({ name, isDefault: false }));
      this.experiences.rows = expData.map((row) => {
        const values = {};
        expColNames.forEach((name) => {
          values[name] = row[name] || '';
        });
        return {
          action: getVal(row, 'action'),
          selector: getVal(row, 'selector'),
          pageFilter: getVal(row, 'page filter') || getVal(row, 'page filter (optional)'),
          values,
        };
      });

      // Resolve the protected "default" column: prefer the persisted
      // marker, fall back to a column literally named "all" (manifests
      // saved before this field existed), then to the first column so
      // the grid is never left without one.
      const defaultEntry = infoData.find((row) => {
        const k = (row.Key ?? row.key ?? '').toLowerCase().replace(/\s+/g, '');
        return k === 'default-column' || k === 'manifest-default-column';
      });
      const defaultEntryValue = defaultEntry ? (defaultEntry.Value ?? defaultEntry.value) : null;
      let defaultCol = defaultEntry
        ? this.experiences.columns.find((c) => c.name === defaultEntryValue)
        : null;
      if (!defaultCol) {
        defaultCol = this.experiences.columns.find((c) => c.name.toLowerCase() === 'all');
      }
      if (!defaultCol) {
        [defaultCol] = this.experiences.columns;
      }
      if (defaultCol) defaultCol.isDefault = true;
    }

    // Load promo placeholders (Key + dynamic Value columns).
    const promoData = sheetData.promo?.data || [];
    if (promoData.length > 0) {
      const getVal = (row, key) => {
        const lk = key.toLowerCase();
        const found = Object.keys(row).find((k) => k.toLowerCase() === lk);
        return found ? (row[found] || '') : '';
      };
      const promoColNames = Object.keys(promoData[0]).filter((k) => k.toLowerCase() !== 'key');
      this.promo.columns = promoColNames.map((name) => ({ name }));
      this.promo.rows = promoData.map((row) => {
        const values = {};
        promoColNames.forEach((name) => {
          values[name] = row[name] || '';
        });
        return { key: getVal(row, 'key'), values };
      });
    } else {
      this.promo.columns = [];
      this.promo.rows = [];
    }

    // Load editor-only cell sizing from the hidden "private-layout" sheet.
    // This sheet is optional and purely cosmetic: it's absent on manifests
    // saved before this existed, and may be missing or malformed on any
    // manifest. Parsing is fully defensive and best-effort — the grid falls
    // back to default sizing and, critically, a bad layout sheet must never
    // prevent the manifest itself from loading. rowHeights is kept parallel
    // to rows (null = unset).
    this.experiences.columnWidths = {};
    this.experiences.rowHeights = this.experiences.rows.map(() => null);
    this.promo.columnWidths = {};
    this.promo.rowHeights = this.promo.rows.map(() => null);
    try {
      const layoutSheet = sheetData['private-layout'];
      const layoutData = Array.isArray(layoutSheet?.data) ? layoutSheet.data : [];
      layoutData.forEach((entry) => {
        if (!entry || typeof entry !== 'object') return;
        const target = String(entry.target ?? '').toLowerCase();
        const id = String(entry.id ?? '');
        const size = Number(entry.size);
        if (!Number.isFinite(size) || size <= 0) return;
        if (target === 'col') {
          if (id) this.experiences.columnWidths[id] = size;
        } else if (target === 'row') {
          const rowIdx = Number(id);
          const heights = this.experiences.rowHeights;
          if (Number.isInteger(rowIdx) && rowIdx >= 0 && rowIdx < heights.length) {
            heights[rowIdx] = size;
          }
        } else if (target === 'promo-col') {
          if (id) this.promo.columnWidths[id] = size;
        } else if (target === 'promo-row') {
          const rowIdx = Number(id);
          const heights = this.promo.rowHeights;
          if (Number.isInteger(rowIdx) && rowIdx >= 0 && rowIdx < heights.length) {
            heights[rowIdx] = size;
          }
        }
      });
    } catch (e) {
      // Any unexpected shape — reset to defaults and keep loading the manifest.
      this.experiences.columnWidths = {};
      this.experiences.rowHeights = this.experiences.rows.map(() => null);
      this.promo.columnWidths = {};
      this.promo.rowHeights = this.promo.rows.map(() => null);
      // eslint-disable-next-line no-console
      console.warn('MEP: ignoring malformed private-layout sheet', e);
    }

    this.dirty = false;
  }

  /**
   * Convert to DA multi-sheet JSON format for saving.
   */
  toSheet() {
    const defaultCol = this.experiences.columns.find((col) => col.isDefault);
    const infoData = [
      { key: 'manifest-type', value: this.info.type },
      { key: 'manifest-override-name', value: this.info.overrideName },
      { key: 'manifest-execution-order', value: this.info.executionOrder },
      { key: 'manifest-consent-type', value: this.info.consentType },
      { key: 'manifest-default-column', value: defaultCol ? defaultCol.name : '' },
    ];

    const placeholderData = this.placeholders.map((ph) => ({
      key: ph.key,
      value: ph.value,
    }));

    const promoData = this.promo.rows.map((row) => {
      const obj = { key: row.key };
      this.promo.columns.forEach((col) => {
        obj[col.name] = row.values[col.name] || '';
      });
      return obj;
    });

    const expData = this.experiences.rows.map((row) => {
      const obj = {
        action: row.action,
        selector: row.selector,
        'page filter (optional)': row.pageFilter,
      };
      this.experiences.columns.forEach((col) => {
        obj[col.name] = row.values[col.name] || '';
      });
      return obj;
    });

    // Editor-only cell sizing → one row per sized column/row. The "private-"
    // prefix keeps this sheet out of the previewed/published output while the
    // DA source API still returns it, so it round-trips within the same file.
    const layoutData = [];
    Object.entries(this.experiences.columnWidths).forEach(([id, size]) => {
      if (Number.isFinite(size)) layoutData.push({ target: 'col', id, size });
    });
    this.experiences.rowHeights.forEach((size, idx) => {
      if (Number.isFinite(size)) layoutData.push({ target: 'row', id: String(idx), size });
    });
    Object.entries(this.promo.columnWidths).forEach(([id, size]) => {
      if (Number.isFinite(size)) layoutData.push({ target: 'promo-col', id, size });
    });
    this.promo.rowHeights.forEach((size, idx) => {
      if (Number.isFinite(size)) layoutData.push({ target: 'promo-row', id: String(idx), size });
    });

    const names = ['experiences', 'info', 'placeholders', 'promo'];
    if (layoutData.length > 0) names.push('private-layout');

    const sheet = {
      ':type': 'multi-sheet',
      ':names': names,
      ':version': 3,
      experiences: {
        total: expData.length,
        offset: 0,
        limit: expData.length,
        data: expData,
        columns: ['action', 'selector', 'page filter (optional)', ...this.experiences.columns.map((col) => col.name)],
      },
      info: {
        total: infoData.length,
        offset: 0,
        limit: infoData.length,
        data: infoData,
        columns: ['key', 'value'],
      },
      placeholders: {
        total: placeholderData.length,
        offset: 0,
        limit: placeholderData.length,
        data: placeholderData,
        columns: ['key', 'value'],
      },
      promo: {
        total: promoData.length,
        offset: 0,
        limit: promoData.length,
        data: promoData,
        columns: ['key', ...this.promo.columns.map((col) => col.name)],
      },
    };

    if (layoutData.length > 0) {
      sheet['private-layout'] = {
        total: layoutData.length,
        offset: 0,
        limit: layoutData.length,
        data: layoutData,
        columns: ['target', 'id', 'size'],
      };
    }

    return sheet;
  }

  markClean() {
    this.dirty = false;
  }

  /**
   * Create a new empty manifest.
   */
  static createNew() {
    const model = new ManifestModel();
    model.addColumn('all', true);
    model.addRow();
    model.addPromoColumn('Value');
    // addColumn/addRow/addPromoColumn mark the model dirty as a side effect,
    // but this initial scaffolding isn't a user edit — a brand-new, untouched
    // manifest shouldn't trip "Discard unsaved changes?" prompts.
    model.markClean();
    return model;
  }
}
