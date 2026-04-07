/**
 * Converts ManifestModel to MEP JSON format for preview/publish.
 *
 * MEP JSON format:
 * {
 *   "info": {
 *     "manifesttype": "personalization",
 *     "executionorder": "Normal",
 *     "overridename": ""
 *   },
 *   "placeholders": { "key1": "val1", ... },
 *   "experiences": [
 *     {
 *       "action": "replaceContent",
 *       "selector": ".hero",
 *       "page filter": "",
 *       "experience-name": "/path/to/fragment"
 *     },
 *     ...
 *   ]
 * }
 */
export function toMepJson(model) {
  const info = {};
  if (model.info.type) info.manifesttype = model.info.type;
  if (model.info.executionOrder) info.executionorder = model.info.executionOrder;
  if (model.info.overrideName) info.overridename = model.info.overrideName;

  const placeholders = {};
  model.placeholders.forEach((ph) => {
    if (ph.key) placeholders[ph.key] = ph.value;
  });

  const experiences = model.experiences.rows.map((row) => {
    const exp = {};
    if (row.action) exp.action = row.action;
    if (row.selector) exp.selector = row.selector;
    if (row.pageFilter) exp['page filter'] = row.pageFilter;
    model.experiences.columns.forEach((col) => {
      const val = row.values[col.name];
      if (val !== undefined) exp[col.name] = val;
    });
    return exp;
  });

  return {
    info,
    placeholders,
    experiences,
  };
}
