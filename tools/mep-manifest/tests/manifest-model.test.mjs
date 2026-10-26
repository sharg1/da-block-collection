import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ManifestModel } from '../src/data/manifest-model.js';

test('copying rows and columns takes independent snapshots without marking dirty', () => {
  const model = ManifestModel.createNew();
  model.updateRow(0, 'action', 'replace');
  model.updateRow(0, 'selector', '.hero');
  model.updateRow(0, 'pageFilter', '/products');
  model.updateRowValue(0, 'all', '/original');
  model.markClean();
  const row = model.copyRow(0);
  const column = model.copyColumn(0);
  assert.equal(model.dirty, false);
  model.updateRowValue(0, 'all', '/edited');
  model.insertRow(1);
  model.pasteRow(1, row);
  assert.deepEqual(model.experiences.rows[1], {
    action: 'replace', selector: '.hero', pageFilter: '/products', values: { all: '/original' },
  });
  model.updateRowValue(1, 'all', '/changed-again');
  assert.equal(row.values.all, '/original');
  assert.deepEqual(column, ['/original']);
});

test('insertion supports both boundaries and keeps layout aligned', () => {
  const model = ManifestModel.createNew();
  model.setRowHeight(0, 90);
  model.setColumnWidth('all', 240);
  model.insertRow(0);
  model.insertRow(model.experiences.rows.length);
  model.insertColumn(0, 'before');
  model.insertColumn(model.experiences.columns.length, 'after');
  assert.deepEqual(model.experiences.rowHeights, [null, 90, null]);
  assert.deepEqual(model.experiences.columns.map((col) => col.name), ['before', 'all', 'after']);
  model.experiences.rows.forEach((row) => {
    assert.deepEqual(row.values, { all: '', before: '', after: '' });
  });
  assert.equal(model.experiences.columnWidths.all, 240);
  assert.equal(model.experiences.columns[1].isDefault, true);
  assert.equal(model.dirty, true);
});

test('column paste retains destination identity and sizing, clearing unmatched rows', () => {
  const model = ManifestModel.createNew();
  model.updateRowValue(0, 'all', '/copied');
  const snapshot = model.copyColumn(0);
  model.insertColumn(1, 'target-new');
  model.setColumnWidth('target-new', 180);
  model.addRow();
  model.updateRowValue(1, 'target-new', '/old');
  model.pasteColumn(1, snapshot);
  assert.deepEqual(model.experiences.rows.map((row) => row.values['target-new']), ['/copied', '']);
  assert.deepEqual(model.experiences.columns[1], { name: 'target-new', isDefault: false });
  assert.equal(model.experiences.columnWidths['target-new'], 180);
  model.pasteColumn(0, snapshot);
  assert.equal(model.experiences.columns[0].isDefault, true);
});

test('row paste maps only current columns and preserves destination height', () => {
  const model = ManifestModel.createNew();
  model.insertColumn(1, 'removed');
  model.updateRowValue(0, 'all', '/copied');
  const snapshot = model.copyRow(0);
  model.removeColumn(1);
  model.insertColumn(1, 'new');
  model.setRowHeight(0, 72);
  model.pasteRow(0, snapshot);
  assert.deepEqual(model.experiences.rows[0].values, { all: '/copied', new: '' });
  assert.deepEqual(model.experiences.rowHeights, [72]);
});

test('invalid insertion or paste is rejected without mutations', () => {
  const model = ManifestModel.createNew();
  const before = model.toSheet();
  ['', ' ALL ', 'action', 'selector', 'page filter (optional)', '__proto__'].forEach((name) => {
    assert.throws(() => model.insertColumn(0, name));
  });
  [-1, 2, 0.5].forEach((idx) => {
    assert.throws(() => model.insertColumn(idx, 'new'));
    assert.throws(() => model.insertRow(idx));
  });
  assert.throws(() => model.pasteColumn(0, null));
  assert.throws(() => model.pasteRow(0, null));
  assert.throws(() => model.copyRow(5));
  assert.throws(() => model.copyColumn(5));
  assert.deepEqual(model.toSheet(), before);
  assert.equal(model.dirty, false);
});

test('inserted and pasted content round-trips in order through DA serialization', () => {
  const model = ManifestModel.createNew();
  model.updateRow(0, 'action', 'replace');
  model.updateRowValue(0, 'all', '/hero');
  const row = model.copyRow(0);
  const column = model.copyColumn(0);
  model.insertColumn(0, 'target-copy');
  model.pasteColumn(0, column);
  model.insertRow(1);
  model.pasteRow(1, row);
  model.setRowHeight(1, 80);
  model.setColumnWidth('target-copy', 200);
  const loaded = new ManifestModel();
  loaded.fromSheet(model.toSheet());
  assert.deepEqual(loaded.experiences, model.experiences);
  assert.equal(loaded.dirty, false);
});
