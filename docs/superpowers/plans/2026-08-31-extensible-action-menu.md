# Extensible Action Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a T&O developer add extra options to the Action-column dropdown by editing a DA config sheet, with no core-code change per action.

**Architecture:** The 10 built-in actions stay hardcoded in code. A new actions-registry module merges those built-ins with additional rows fetched at app-init from a DA config sheet (`/tools/mep-manifest/actions.json`). The experiences grid renders its dropdown from the merged registry. Built-in actions keep their existing named CSS accent classes; extended actions get a generic `action-custom` / `row-custom` accent driven by a `--row-accent` CSS variable set inline from the sheet's `color` column.

**Tech Stack:** Plain browser ES modules (no build step), ESLint (airbnb-base), Stylelint. DA Admin source API for fetching sheets. Runs as a DA plugin inside an iframe.

**Spec:** `docs/superpowers/specs/2026-08-31-extensible-action-menu-design.md`

## Global Constraints

- No build step and no new runtime dependencies — plain ES modules only.
- No unit-test runner in this repo. Verification per task = `npm run lint:js` (and `npm run lint:css` for the CSS task) passing, plus a final manual smoke test in DA.
- ESLint config is airbnb-base; any intentional `console` use needs an inline `// eslint-disable-next-line no-console` (matches existing pattern in the codebase).
- Config is purely additive: it may only ADD actions. It must never override, reorder, or remove a built-in, and a missing/broken config sheet must never break the tool.
- Config sheet path is exactly `tools/mep-manifest/actions.json` (no leading slash when passed to the source URL builder).
- Built-in action list (do not change): `remove`, `replace`, `insertBefore`, `insertAfter`, `prependToSection`, `appendToSection`, `replacePage`, `useBlockCode`, `insertScript`, `updateMetadata`.

---

### Task 1: Config-loading adapter function

**Files:**
- Modify: `tools/mep-manifest/src/data/da-sheet-adapter.js`

**Interfaces:**
- Consumes: existing `buildSourceUrl(org, site, path)` and `authHeaders()` in this file.
- Produces: `export async function fetchActionsConfig(org, site)` → resolves to an array of raw row objects (e.g. `[{ action, label, color }, ...]`), or `[]` on any failure.

- [ ] **Step 1: Add the fetch function and row extractor**

Append to `tools/mep-manifest/src/data/da-sheet-adapter.js` (after `publishManifest`):

```js
// Conventional location of the optional extra-actions config sheet, relative
// to the site root. Authors edit this as a normal DA sheet to add dropdown
// options without a code deploy.
const ACTIONS_CONFIG_PATH = 'tools/mep-manifest/actions.json';

/**
 * Pull the row array out of a DA sheet JSON, tolerating both the single-sheet
 * shape ({ data: [...] }) and the multi-sheet shape ({ ':names': [...],
 * <name>: { data: [...] } }) — mirrors the tolerance in ManifestModel.fromSheet.
 */
function extractSheetRows(json) {
  if (!json || typeof json !== 'object') return [];
  if (Array.isArray(json.data)) return json.data;
  if (Array.isArray(json[':names']) && json[':names'].length > 0) {
    const first = json[':names'][0];
    if (first && Array.isArray(json[first]?.data)) return json[first].data;
  }
  return [];
}

/**
 * Load the optional extra-actions config sheet from DA. Purely additive — any
 * failure (missing sheet, network error, malformed JSON) resolves to [] so the
 * tool falls back to the built-in action list and keeps working.
 */
export async function fetchActionsConfig(org, site) {
  try {
    const url = buildSourceUrl(org, site, ACTIONS_CONFIG_PATH);
    const resp = await fetch(url, { headers: authHeaders() });
    if (!resp.ok) return [];
    const json = await resp.json();
    return extractSheetRows(json);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('MEP: could not load actions config sheet', e);
    return [];
  }
}
```

- [ ] **Step 2: Lint**

Run: `npm run lint:js`
Expected: PASS (no errors in `da-sheet-adapter.js`).

- [ ] **Step 3: Commit**

```bash
git add tools/mep-manifest/src/data/da-sheet-adapter.js
git commit -m "feat(mep): add fetchActionsConfig adapter for extra-actions sheet"
```

---

### Task 2: Actions registry module

**Files:**
- Create: `tools/mep-manifest/src/data/actions-registry.js`

**Interfaces:**
- Consumes: `ACTIONS` exported from `./manifest-model.js` (the 10 built-in action values).
- Produces:
  - `setExtendedActions(rows)` — void; normalizes/dedupes config rows into the module's extended list.
  - `getActions()` → `Array<{ value: string, label: string, color: string }>` — built-ins first (label = value, color = ''), then extended entries.
  - `isExtendedAction(value)` → boolean.
  - `getExtendedActionColor(value)` → string (the color, possibly '') if extended, else `null`.

- [ ] **Step 1: Create the registry module**

Create `tools/mep-manifest/src/data/actions-registry.js`:

```js
/**
 * Actions registry: single source of truth for the Action-column dropdown.
 * Merges the built-in actions (from the model) with extra actions supplied at
 * runtime by a DA config sheet. Config can only ADD — built-ins are protected.
 */
import { ACTIONS as BUILT_IN_ACTIONS } from './manifest-model.js';

// [{ value, label, color }] — populated once at app init from the config sheet.
let extendedActions = [];

/**
 * Normalize and store config rows. Skips rows with no action value, rows whose
 * value collides with a built-in (built-in wins), and duplicates within config
 * (first occurrence wins).
 * @param {Array<{action?: string, label?: string, color?: string}>} rows
 */
export function setExtendedActions(rows) {
  const builtin = new Set(BUILT_IN_ACTIONS);
  const seen = new Set();
  extendedActions = [];
  (rows || []).forEach((row) => {
    const value = String(row.action ?? '').trim();
    if (!value) return;
    if (builtin.has(value)) return;
    if (seen.has(value)) return;
    seen.add(value);
    extendedActions.push({
      value,
      label: String(row.label ?? '').trim() || value,
      color: String(row.color ?? '').trim(),
    });
  });
}

/**
 * Merged dropdown list: built-ins first, then config extras.
 * @returns {Array<{value: string, label: string, color: string}>}
 */
export function getActions() {
  const builtins = BUILT_IN_ACTIONS.map((value) => ({ value, label: value, color: '' }));
  return [...builtins, ...extendedActions];
}

/** True if the value came from the config sheet (not a built-in). */
export function isExtendedAction(value) {
  return extendedActions.some((a) => a.value === value);
}

/**
 * Color for an extended action's accent, or null when the value is a built-in
 * or unknown. An extended action with no configured color returns '' (caller
 * falls back to the neutral accent).
 */
export function getExtendedActionColor(value) {
  const found = extendedActions.find((a) => a.value === value);
  return found ? found.color : null;
}
```

- [ ] **Step 2: Lint**

Run: `npm run lint:js`
Expected: PASS (no errors in `actions-registry.js`).

- [ ] **Step 3: Commit**

```bash
git add tools/mep-manifest/src/data/actions-registry.js
git commit -m "feat(mep): add actions registry merging built-ins with config extras"
```

---

### Task 3: Load config at app init

**Files:**
- Modify: `tools/mep-manifest/src/app.js`

**Interfaces:**
- Consumes: `fetchActionsConfig(org, site)` (Task 1), `setExtendedActions(rows)` (Task 2), existing `getOrgSite()` in `app.js`.
- Produces: no new export. Side effect: the registry is populated before the first file-browser/editor render.

- [ ] **Step 1: Import the new functions**

In `tools/mep-manifest/src/app.js`, update the two data imports at the top. Change:

```js
import { openManifest, saveManifest, previewManifest, publishManifest, setToken } from './data/da-sheet-adapter.js';
```

to:

```js
import {
  openManifest, saveManifest, previewManifest, publishManifest, setToken, fetchActionsConfig,
} from './data/da-sheet-adapter.js';
import { setExtendedActions } from './data/actions-registry.js';
```

- [ ] **Step 2: Fetch config before first render**

In `initApp`, make it async and load the config after `setToken` and before the open/browse branch. Replace the current `initApp`:

```js
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
```

with:

```js
export async function initApp(container, sdkData) {
  sdk = sdkData;
  appContainer = container;
  setToken(sdk.token);

  // Load extra dropdown actions from the DA config sheet (additive; failures
  // resolve to [] and the tool falls back to the built-in action list).
  const { org, site } = getOrgSite();
  const configRows = await fetchActionsConfig(org, site);
  setExtendedActions(configRows);

  // Check URL for a direct file path to auto-open
  const urlParams = new URLSearchParams(window.location.search);
  const openPath = urlParams.get('path');
  if (openPath) {
    handleOpen(openPath);
  } else {
    showFileBrowser();
  }
}
```

(The caller in `mep-manifest.js` invokes `initApp(...)` without awaiting it, which is fine — the config fetch is awaited inside `initApp`, so the registry is populated before either render branch runs.)

- [ ] **Step 3: Lint**

Run: `npm run lint:js`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tools/mep-manifest/src/app.js
git commit -m "feat(mep): load extra actions from config sheet at app init"
```

---

### Task 4: CSS for the custom-action accent

**Files:**
- Modify: `tools/mep-manifest/mep-manifest.css`

**Interfaces:**
- Produces: two CSS rules keyed on `--row-accent` custom property — `td.action-custom` (left-border) and `tr.row-custom > td` (background tint). Consumed by Task 5, which sets the classes and the inline `--row-accent` value.

- [ ] **Step 1: Add the custom accent rules**

In `tools/mep-manifest/mep-manifest.css`, immediately after the built-in action-cell accent block (after the line `.mep-grid td.action-updatemetadata  { border-left: 3px solid var(--action-green-border); }`), add:

```css
/* Extended (config-sheet) action accent — driven by an inline --row-accent
   custom property set on the row; falls back to a neutral gray when the
   config row has no color. */
.mep-grid td.action-custom {
  border-left: 3px solid var(--row-accent, var(--action-gray-border));
}
```

Then, immediately after the built-in row-background block (after the line `.mep-grid tr.row-updatemetadata > td   { background: var(--action-green); }`), add:

```css
.mep-grid tr.row-custom > td {
  background: color-mix(in srgb, var(--row-accent, var(--action-gray-border)) 12%, white);
}
```

- [ ] **Step 2: Lint**

Run: `npm run lint:css`
Expected: PASS. If Stylelint flags `color-mix` or the property order, fix per its message (e.g. reorder declarations); do not remove the `color-mix` fallback.

- [ ] **Step 3: Commit**

```bash
git add tools/mep-manifest/mep-manifest.css
git commit -m "feat(mep): add custom-action accent styles driven by --row-accent"
```

---

### Task 5: Render dropdown from registry + branch the accent

**Files:**
- Modify: `tools/mep-manifest/src/ui/experiences-tab.js`

**Interfaces:**
- Consumes: `getActions()`, `isExtendedAction(value)`, `getExtendedActionColor(value)` (Task 2); existing module-level `ACTION_CSS_MAP` and `ROW_CSS_MAP`.
- Produces: no new export. Adds a module-local `applyActionAccent(td, tr, value)` helper and switches the dropdown to the merged registry.

- [ ] **Step 1: Import the registry**

At the top of `tools/mep-manifest/src/ui/experiences-tab.js`, change:

```js
import { ACTIONS, MANIFEST_TYPES, EXECUTION_ORDERS } from '../data/manifest-model.js';
```

to:

```js
import { MANIFEST_TYPES, EXECUTION_ORDERS } from '../data/manifest-model.js';
import { getActions, isExtendedAction, getExtendedActionColor } from '../data/actions-registry.js';
```

(`ACTIONS` is no longer imported here — the registry is now the source. Leave the `ACTIONS` export in `manifest-model.js` in place; other code/back-compat may reference it.)

- [ ] **Step 2: Add the shared accent helper**

Add this function just above `createActionCell` (before its JSDoc comment, ~line 447):

```js
/**
 * Apply the visual accent for an action to its cell (<td> left border) and row
 * (<tr> background). Clears any prior built-in or custom accent first so
 * switching actions never leaves stale styling behind.
 * - Built-in actions use their named CSS classes (unchanged behavior).
 * - Extended (config) actions use the generic action-custom / row-custom
 *   classes, with an inline --row-accent color when the config supplied one.
 */
function applyActionAccent(td, tr, value) {
  // Clear built-in classes
  Object.values(ACTION_CSS_MAP).forEach((cls) => td.classList.remove(cls));
  Object.values(ROW_CSS_MAP).forEach((cls) => tr.classList.remove(cls));
  // Clear custom accent
  td.classList.remove('action-custom');
  tr.classList.remove('row-custom');
  tr.style.removeProperty('--row-accent');

  if (!value) return;

  if (ACTION_CSS_MAP[value]) {
    td.classList.add(ACTION_CSS_MAP[value]);
    if (ROW_CSS_MAP[value]) tr.classList.add(ROW_CSS_MAP[value]);
    return;
  }

  if (isExtendedAction(value)) {
    td.classList.add('action-custom');
    tr.classList.add('row-custom');
    const color = getExtendedActionColor(value);
    if (color) tr.style.setProperty('--row-accent', color);
  }
}
```

- [ ] **Step 3: Use the registry for the initial row background**

Replace the initial row-background block (currently ~lines 258-261):

```js
      // Apply row background color class if action is set
      if (row.action && ROW_CSS_MAP[row.action]) {
        tr.classList.add(ROW_CSS_MAP[row.action]);
      }
```

with:

```js
      // Apply row background: built-in named class, or the generic custom class
      // for config-defined actions.
      if (row.action) {
        if (ROW_CSS_MAP[row.action]) {
          tr.classList.add(ROW_CSS_MAP[row.action]);
        } else if (isExtendedAction(row.action)) {
          tr.classList.add('row-custom');
          const color = getExtendedActionColor(row.action);
          if (color) tr.style.setProperty('--row-accent', color);
        }
      }
```

- [ ] **Step 4: Rebuild `createActionCell` to use the registry and helper**

Replace the whole `createActionCell` function (currently ~lines 451-490):

```js
function createActionCell(row, rowIdx, model, tr) {
  const td = document.createElement('td');
  td.className = 'action-cell';
  if (row.action && ACTION_CSS_MAP[row.action]) td.classList.add(ACTION_CSS_MAP[row.action]);

  const select = document.createElement('select');
  select.className = 'action-select';

  const emptyOpt = document.createElement('option');
  emptyOpt.value = '';
  emptyOpt.textContent = '— Select Action —';
  select.append(emptyOpt);

  ACTIONS.forEach((action) => {
    const opt = document.createElement('option');
    opt.value = action;
    opt.textContent = action;
    if (action === row.action) opt.selected = true;
    select.append(opt);
  });

  select.addEventListener('change', (e) => {
    model.updateRow(rowIdx, 'action', e.target.value);

    // Update <td> left-border accent
    Object.values(ACTION_CSS_MAP).forEach((cls) => td.classList.remove(cls));
    if (e.target.value && ACTION_CSS_MAP[e.target.value]) {
      td.classList.add(ACTION_CSS_MAP[e.target.value]);
    }

    // Update <tr> row background
    Object.values(ROW_CSS_MAP).forEach((cls) => tr.classList.remove(cls));
    if (e.target.value && ROW_CSS_MAP[e.target.value]) {
      tr.classList.add(ROW_CSS_MAP[e.target.value]);
    }
  });

  td.append(select);
  return td;
}
```

with:

```js
function createActionCell(row, rowIdx, model, tr) {
  const td = document.createElement('td');
  td.className = 'action-cell';

  const select = document.createElement('select');
  select.className = 'action-select';

  const emptyOpt = document.createElement('option');
  emptyOpt.value = '';
  emptyOpt.textContent = '— Select Action —';
  select.append(emptyOpt);

  // Options from the merged registry: built-ins first, then config extras.
  let currentIsKnown = !row.action;
  getActions().forEach(({ value, label }) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    if (value === row.action) {
      opt.selected = true;
      currentIsKnown = true;
    }
    select.append(opt);
  });

  // Preserve an action value that isn't in the current registry (e.g. a
  // manifest referencing an action whose config row was removed) so opening
  // and saving the file never silently drops it.
  if (!currentIsKnown) {
    const opt = document.createElement('option');
    opt.value = row.action;
    opt.textContent = row.action;
    opt.selected = true;
    select.append(opt);
  }

  // Initial <td> accent (row background is set by the row renderer).
  if (row.action && ACTION_CSS_MAP[row.action]) {
    td.classList.add(ACTION_CSS_MAP[row.action]);
  } else if (row.action && isExtendedAction(row.action)) {
    td.classList.add('action-custom');
    const color = getExtendedActionColor(row.action);
    if (color) tr.style.setProperty('--row-accent', color);
  }

  select.addEventListener('change', (e) => {
    model.updateRow(rowIdx, 'action', e.target.value);
    applyActionAccent(td, tr, e.target.value);
  });

  td.append(select);
  return td;
}
```

- [ ] **Step 5: Lint**

Run: `npm run lint:js`
Expected: PASS. In particular, confirm no `no-unused-vars` error — `ACTIONS` must no longer be referenced in this file.

- [ ] **Step 6: Commit**

```bash
git add tools/mep-manifest/src/ui/experiences-tab.js
git commit -m "feat(mep): render Action dropdown from registry with custom accents"
```

---

### Task 6: Manual smoke test in DA + author docs

**Files:**
- Modify: `tools/mep-manifest/DUE-DILIGENCE.md` (or `README` if one exists for the tool) — document the config sheet.

**Interfaces:**
- Consumes: the full feature (Tasks 1-5).
- Produces: a short authoring note so T&O devs know the sheet exists, its path, and its columns.

- [ ] **Step 1: Create a test config sheet in DA**

In the DA site the tool edits (org/site from the SDK context, e.g. `sharg1` / `da-block-collection`), create a sheet at `tools/mep-manifest/actions.json` with a single sheet named e.g. `data` containing columns `action`, `label`, `color` and rows such as:

| action | label | color |
|--------|-------|-------|
| swapContent | Swap Content | #0aa |
| customScript | Custom Script | |

- [ ] **Step 2: Reload the tool and verify**

Open the MEP Manifest tool in DA, open or create a manifest, and confirm on the Experiences tab:
- The Action dropdown lists the 10 built-ins first, then `Swap Content` and `Custom Script`.
- Selecting `Swap Content` shows a teal (`#0aa`) left border and a light teal row tint.
- Selecting `Custom Script` (no color) shows a neutral gray accent + light gray tint.
- Switching from an extended action back to a built-in (and vice versa) leaves no stale border/background.
- The selected extended action saves to the manifest and round-trips: save, close, reopen — the value and accent are still shown.
- Temporarily rename the config sheet away / delete it and reload: the tool still works with only the 10 built-ins (no errors in the console).

- [ ] **Step 3: Document the config sheet for authors**

Add a short section to `tools/mep-manifest/DUE-DILIGENCE.md` (append at the end):

```markdown
## Extending the Action dropdown

The Action-column dropdown ships with a fixed set of built-in actions. To add
more without a code change, create a DA sheet at:

    /tools/mep-manifest/actions.json

Columns:

| Column   | Required | Purpose                                              |
|----------|----------|------------------------------------------------------|
| `action` | yes      | Value written to the manifest. Must match what the MEP runtime expects. |
| `label`  | no       | Display text in the dropdown (defaults to `action`). |
| `color`  | no       | CSS color for the row/cell accent (defaults to neutral gray). |

Rows are additive: they can only add options, never override or reorder the
built-ins. A row whose `action` matches a built-in is ignored. The sheet is
read live via the DA source API, so saving it makes new actions available on
the next tool reload — no preview/publish needed.
```

- [ ] **Step 4: Commit**

```bash
git add tools/mep-manifest/DUE-DILIGENCE.md
git commit -m "docs(mep): document the extra-actions config sheet"
```

---

## Self-Review

**Spec coverage:**
- §1 Config sheet (path, columns, source-API read) → Task 1 (path + fetch), Task 6 (author docs, manual creation). ✅
- §2 Registry (built-ins first, dedupe vs built-ins, skip blank, dedupe within config, default label) → Task 2. ✅
- §3 Loading (once at init, graceful `[]` fallback) → Task 1 (fallback) + Task 3 (init wiring). ✅
- §4 Accent rendering (built-in class vs inline custom, clear stale on change) → Task 4 (CSS) + Task 5 (`applyActionAccent`, initial render branches). ✅
- §5 Wiring/data flow → Task 3 + Task 5. ✅
- Testing section (manual DA smoke test) → Task 6. ✅
- Out-of-scope items (no per-action logic, no built-in override, no in-tool sheet editing, no serialization change) → respected; the manifest is still saved via the unchanged `toSheet`. ✅

**Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to Task N". All code steps show full code. ✅

**Type consistency:** `setExtendedActions`, `getActions`, `isExtendedAction`, `getExtendedActionColor`, `applyActionAccent`, `fetchActionsConfig` are named identically wherever referenced across Tasks 1-5. Registry entry shape `{ value, label, color }` is consistent between producer (Task 2) and consumer (Task 5). CSS classes `action-custom` / `row-custom` and the `--row-accent` property match between Task 4 (defines) and Task 5 (sets). ✅

**Note added during review:** Task 5 Step 4 preserves an unknown action value already present in a manifest (config row later removed) so save/reopen never silently drops it — a real edge case the spec's "additive, non-destructive" intent implies.
