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
    if (!row || typeof row !== 'object') return;
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
