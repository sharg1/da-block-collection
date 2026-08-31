# Extensible Action Menu via DA Config Sheet — Design

**Date:** 2026-08-31
**Tool:** `tools/mep-manifest` (MEP Manifest editor, runs as a DA plugin)
**Status:** Approved design, ready for implementation planning

## Problem

As an A.com T&O engineer, I want to add more selections to the Action column
pull-down list without editing core tool code for every new action.

**Acceptance criterion:** A T&O developer can extend the menu.

## Current State

The Action dropdown is driven by a hardcoded array in
`tools/mep-manifest/src/data/manifest-model.js`:

```js
const ACTIONS = [
  'remove', 'replace', 'insertBefore', 'insertAfter',
  'prependToSection', 'appendToSection', 'replacePage',
  'useBlockCode', 'insertScript', 'updateMetadata',
];
```

Each action name is additionally wired into two hardcoded CSS maps in
`tools/mep-manifest/src/ui/experiences-tab.js`:

- `ACTION_CSS_MAP` — CSS class for the action `<td>` left-border accent
- `ROW_CSS_MAP` — CSS class applied to the whole `<tr>` for row background

The dropdown is built by looping over `ACTIONS`
(`experiences-tab.js` `createActionCell`, ~line 464). The selected value is
written to the manifest sheet as a plain string. The **runtime meaning** of
each action lives in the MEP/Milo personalization engine, not in this tool —
this tool is purely an authoring UI.

Consequence: adding one action today means editing three places across two
files, all in core code.

## Scope (decided)

- **Extension scope:** *Just menu items* — value + label + color accent. No
  per-action behavior/validation/logic in the tool; the runtime interprets the
  action string.
- **Mechanism:** *Hybrid, additive* — the 10 built-ins stay in code as the
  baseline; a DA config sheet contributes **additional** items with no code
  deploy. Config can only add, never override or reorder built-ins.

## Design

### 1. Config sheet (DA)

A single DA sheet at a conventional path in the same site the tool is editing:

```
/tools/mep-manifest/actions.json
```

Columns:

| Column   | Required | Purpose                                                                 |
|----------|----------|-------------------------------------------------------------------------|
| `action` | yes      | Value written to the manifest (e.g. `swapContent`). Must match runtime. |
| `label`  | no       | Display text in the dropdown. Defaults to the `action` value.           |
| `color`  | no       | CSS color for the cell/row accent. Defaults to a neutral custom accent. |

Read via the DA **source** API (`admin.da.live/source/...`), so saving the
sheet makes new actions appear immediately — no preview/publish required.

The sheet is expected in single-sheet DA shape: `{ ..., data: [ {action,
label, color}, ... ] }`. If the file is a multi-sheet doc, read the first
named sheet's `data` array (mirror the tolerance already in
`manifest-model.fromSheet`).

### 2. Actions registry (single source of truth)

Introduce one registry that the UI consumes instead of importing the raw
`ACTIONS` array.

- `BUILT_IN_ACTIONS` — the current 10 action values, kept in code unchanged.
- Registry entry shape: `{ value, label, color }`. Built-ins have
  `color: null` (they use their existing named CSS classes; see §4).
- Merged list = built-ins **first**, then config extras.
- **Dedupe rule:** a config row whose `action` matches a built-in (case-
  sensitive value match) is **skipped**. Built-ins are protected — config can
  only add.
- Rows with a blank/whitespace-only `action` are silently skipped.
- Duplicate `action` values *within* the config are deduped (first wins).

### 3. Loading (graceful, additive)

- Add `fetchActionsConfig(org, site)` to
  `tools/mep-manifest/src/data/da-sheet-adapter.js`, mirroring `openManifest`
  (same source URL builder + auth headers).
- Called **once** at app init (`initApp` in `app.js`), before the first editor
  render, populating the registry's extended list.
- Failure handling → returns `[]` and the tool falls back to built-ins only:
  - 404 (no config sheet) — expected, silent.
  - Network error / non-OK status — swallow, log to console, continue.
  - Malformed JSON / missing `data` array — treat as empty.
- Config is purely additive; a missing or broken config sheet never blocks the
  tool or changes existing behavior.

### 4. Rendering the accent (built-in vs extended)

`ACTION_CSS_MAP` / `ROW_CSS_MAP` only know the 10 built-ins, so accent
resolution branches:

- **Built-in action** → keep using its existing named CSS class, exactly as
  today. No visual change, no regression.
- **Extended action** → apply the accent via **inline style** derived from the
  row's `color`:
  - cell left-border color = `color`
  - row background = a subtle tint derived from `color` (e.g. low-alpha
    variant), matching the visual weight of built-in row backgrounds.
  - If `color` is blank → apply a single neutral `action-custom` fallback
    class (define once in `mep-manifest.css`).
- `createActionCell` loops over the **merged registry** to build `<option>`s
  (using `entry.value` and `entry.label`), replacing the hardcoded `ACTIONS`
  loop.
- The `change` handler must clear both the named built-in classes **and** any
  inline accent styles before applying the newly selected action's accent, so
  switching between a built-in and an extended action leaves no stale styling.

### 5. Wiring / data flow

1. `initApp(container, sdkData)` → after `setToken`, `await
   fetchActionsConfig(org, site)` and load results into the registry.
2. `renderExperiencesTab` / `createActionCell` read the merged registry and the
   accent resolver from the registry module (not the raw `ACTIONS` import).
3. `manifest-model.js` may keep exporting `ACTIONS` for back-compat, but the UI
   no longer depends on it directly; the registry owns the merged list.

## Components Touched

| File | Change |
|------|--------|
| `src/data/da-sheet-adapter.js` | Add `fetchActionsConfig(org, site)` — fetch + graceful fallback to `[]`. |
| `src/data/actions-registry.js` (new) | `BUILT_IN_ACTIONS`, merge/dedupe logic, `getActions()`, `getActionAccent(value)`, `loadExtendedActions(rows)`. |
| `src/ui/experiences-tab.js` | Build dropdown from registry; branch accent (class vs inline); clear stale accent on change. |
| `src/app.js` | Fetch config once at init and populate the registry before first render. |
| `mep-manifest.css` | Add neutral `action-custom` fallback accent class. |

## Error Handling Summary

- Missing config sheet (404) → built-ins only, silent.
- Network/HTTP error → built-ins only, console warning.
- Malformed sheet / no `data` → built-ins only.
- Config row missing `action` → row skipped.
- Config row duplicating a built-in → row skipped (built-in wins).
- Duplicate within config → first occurrence wins.

## Testing

- **Registry unit behavior:** merge order (built-ins first), dedupe vs
  built-ins, skip blank `action`, dedupe within config, default `label` = value.
- **Adapter fallback:** 404 → `[]`; network error → `[]`; malformed JSON →
  `[]`.
- **Rendering:** built-in action renders its named CSS class; extended action
  with `color` renders inline accent; extended action without `color` renders
  `action-custom`; switching between the two clears stale styling.
- **End-to-end (manual in DA):** add a row to `/tools/mep-manifest/actions.json`,
  reload the tool, confirm the new action appears, is selectable, persists to
  the manifest, and round-trips on save/reopen.

## Out of Scope

- Per-action logic/validation/conditional fields in the tool (runtime owns
  action semantics).
- Overriding or reordering built-in actions from config.
- Editing the config sheet from within the tool (authors use DA directly).
- Any change to how actions are serialized into the manifest sheet.
