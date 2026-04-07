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
    };
    this.dirty = false;
    this.listeners = [];
    this.filePath = '';
  }

  onChange(fn) {
    this.listeners.push(fn);
  }

  emit() {
    this.dirty = true;
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

  addColumn(name) {
    this.experiences.columns.push({ name });
    // Add empty value for this column to all existing rows
    this.experiences.rows.forEach((row) => {
      row.values[name] = '';
    });
    this.emit();
  }

  removeColumn(idx) {
    const col = this.experiences.columns[idx];
    this.experiences.columns.splice(idx, 1);
    this.experiences.rows.forEach((row) => {
      delete row.values[col.name];
    });
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
    this.emit();
  }

  moveRow(fromIdx, toIdx) {
    const [row] = this.experiences.rows.splice(fromIdx, 1);
    this.experiences.rows.splice(toIdx, 0, row);
    this.emit();
  }

  /* ---- Serialization: to/from DA sheet format ---- */

  /**
   * Load from DA multi-sheet JSON format.
   * Expected structure:
   * {
   *   ":names": ["experiences", "info", "placeholders"],
   *   "info": { "data": [{ "Key": "...", "Value": "..." }, ...] },
   *   "placeholders": { "data": [{ "Key": "...", "Value": "..." }, ...] },
   *   "experiences": { "data": [{ "Action": "...", "Selector": "...", ... }, ...] }
   * }
   */
  fromSheet(sheetData) {
    if (!sheetData) return;

    // Load info
    const infoData = sheetData.info?.data || sheetData[':names']?.includes('info')
      ? (sheetData.info?.data || [])
      : [];
    infoData.forEach((row) => {
      const key = (row.Key || '').toLowerCase().replace(/\s+/g, '');
      if (key === 'manifesttype' || key === 'manifest-type') this.info.type = row.Value || 'personalization';
      if (key === 'executionorder' || key === 'execution-order') this.info.executionOrder = row.Value || 'Normal';
      if (key === 'overridename' || key === 'override-name') this.info.overrideName = row.Value || '';
    });

    // Load placeholders
    const phData = sheetData.placeholders?.data || [];
    this.placeholders = phData.map((row) => ({
      key: row.Key || '',
      value: row.Value || '',
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
      const fixedCols = ['action', 'selector', 'page filter', 'pagefilter'];
      const allKeys = Object.keys(expData[0]);
      const expColNames = allKeys.filter((k) => !fixedCols.includes(k.toLowerCase()));

      this.experiences.columns = expColNames.map((name) => ({ name }));
      this.experiences.rows = expData.map((row) => {
        const values = {};
        expColNames.forEach((name) => {
          values[name] = row[name] || '';
        });
        return {
          action: getVal(row, 'action'),
          selector: getVal(row, 'selector'),
          pageFilter: getVal(row, 'page filter'),
          values,
        };
      });
    }

    this.dirty = false;
  }

  /**
   * Convert to DA multi-sheet JSON format for saving.
   */
  toSheet() {
    const infoData = [
      { Key: 'manifest-type', Value: this.info.type },
      { Key: 'execution-order', Value: this.info.executionOrder },
      { Key: 'override-name', Value: this.info.overrideName },
    ];

    const placeholderData = this.placeholders.map((ph) => ({
      Key: ph.key,
      Value: ph.value,
    }));

    const expData = this.experiences.rows.map((row) => {
      const obj = {
        Action: row.action,
        Selector: row.selector,
        'Page Filter': row.pageFilter,
      };
      this.experiences.columns.forEach((col) => {
        obj[col.name] = row.values[col.name] || '';
      });
      return obj;
    });

    return {
      ':type': 'multi-sheet',
      ':names': ['experiences', 'info', 'placeholders'],
      ':version': 3,
      experiences: {
        total: expData.length,
        offset: 0,
        limit: expData.length,
        data: expData,
      },
      info: {
        total: infoData.length,
        offset: 0,
        limit: infoData.length,
        data: infoData,
      },
      placeholders: {
        total: placeholderData.length,
        offset: 0,
        limit: placeholderData.length,
        data: placeholderData,
      },
    };
  }

  markClean() {
    this.dirty = false;
  }

  /**
   * Create a new empty manifest.
   */
  static createNew() {
    const model = new ManifestModel();
    model.addColumn('all');
    model.addRow();
    return model;
  }
}
