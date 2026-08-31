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

export { ACTIONS, MANIFEST_TYPES, EXECUTION_ORDERS };

export class ManifestModel {
  constructor() {
    this.info = {
      type: 'personalization',
      executionOrder: 'Normal',
      overrideName: '',
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
    this.experiences.columns.push({ name, isDefault });
    // Add empty value for this column to all existing rows
    this.experiences.rows.forEach((row) => {
      row.values[name] = '';
    });
    this.emit();
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

  /* ---- Experience Rows ---- */

  addRow() {
    const values = {};
    this.experiences.columns.forEach((col) => {
      values[col.name] = '';
    });
    this.experiences.rows.push({
      action: '',
      selector: '',
      pageFilter: '',
      values,
    });
    this.experiences.rowHeights.push(null);
    this.emit();
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

  /* ---- Cell sizing (editor-only, persisted via private-layout sheet) ---- */

  setColumnWidth(id, px) {
    this.experiences.columnWidths[id] = px;
    this.emit();
  }

  setRowHeight(idx, px) {
    this.experiences.rowHeights[idx] = px;
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

    // Load editor-only cell sizing from the hidden "private-layout" sheet.
    // This sheet is optional and purely cosmetic: it's absent on manifests
    // saved before this existed, and may be missing or malformed on any
    // manifest. Parsing is fully defensive and best-effort — the grid falls
    // back to default sizing and, critically, a bad layout sheet must never
    // prevent the manifest itself from loading. rowHeights is kept parallel
    // to rows (null = unset).
    this.experiences.columnWidths = {};
    this.experiences.rowHeights = this.experiences.rows.map(() => null);
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
        }
      });
    } catch (e) {
      // Any unexpected shape — reset to defaults and keep loading the manifest.
      this.experiences.columnWidths = {};
      this.experiences.rowHeights = this.experiences.rows.map(() => null);
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
      { key: 'manifest-default-column', value: defaultCol ? defaultCol.name : '' },
    ];

    const placeholderData = this.placeholders.map((ph) => ({
      key: ph.key,
      value: ph.value,
    }));

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

    const names = ['experiences', 'info', 'placeholders'];
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
    // addColumn/addRow mark the model dirty as a side effect, but this
    // initial scaffolding isn't a user edit — a brand-new, untouched
    // manifest shouldn't trip "Discard unsaved changes?" prompts.
    model.markClean();
    return model;
  }
}
