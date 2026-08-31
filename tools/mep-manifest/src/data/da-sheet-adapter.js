const DA_ADMIN = 'https://admin.da.live';
const HLX_ADMIN = 'https://admin.hlx.page';

let _token = '';

export function setToken(token) {
  _token = token || '';
}

function authHeaders(extra = {}) {
  return _token ? { Authorization: `Bearer ${_token}`, ...extra } : extra;
}

function hlxHeaders(extra = {}) {
  return _token ? {
    Authorization: `Bearer ${_token}`,
    'x-content-source-authorization': `Bearer ${_token}`,
    ...extra,
  } : extra;
}

function buildSourceUrl(org, site, path) {
  return `${DA_ADMIN}/source/${org}/${site}/${path}`;
}

/**
 * List files/folders at a given path using the DA list API.
 * Handles pagination via da-continuation-token to return ALL items.
 * Returns an array of { name, path, ext } items — folders have no ext.
 */
export async function listFiles(org, site, folder) {
  const cleanFolder = (folder || '').replace(/^\/|\/$/g, '');
  const base = `${DA_ADMIN}/list/${org}/${site}${cleanFolder ? `/${cleanFolder}` : ''}`;

  let allItems = [];
  let continuationToken = null;

  do {
    const headers = authHeaders(continuationToken ? { 'da-continuation-token': continuationToken } : {});

    // eslint-disable-next-line no-await-in-loop
    const resp = await fetch(base, { headers });
    if (!resp.ok) throw new Error(`Failed to list files: ${resp.status}`);

    // eslint-disable-next-line no-await-in-loop
    const data = await resp.json();
    const items = Array.isArray(data) ? data : (data.items || []);
    allItems = allItems.concat(items);

    continuationToken = resp.headers.get('da-continuation-token');
  } while (continuationToken);

  return allItems;
}

/**
 * Open a manifest sheet from DA.
 */
export async function openManifest(org, site, path) {
  const normalizedPath = path.endsWith('.json') ? path : `${path}.json`;
  const url = buildSourceUrl(org, site, normalizedPath);
  const resp = await fetch(url, { headers: authHeaders() });
  if (!resp.ok) {
    if (resp.status === 404) return null;
    throw new Error(`Failed to open manifest: ${resp.status}`);
  }
  return resp.json();
}

/**
 * Save manifest data as a DA sheet.
 */
export async function saveManifest(org, site, path, data) {
  const url = buildSourceUrl(org, site, path);
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const formData = new FormData();
  formData.append('data', blob);

  const resp = await fetch(url, { method: 'PUT', body: formData, headers: authHeaders() });
  if (!resp.ok) throw new Error(`Failed to save manifest: ${resp.status}`);
  return resp;
}

/**
 * Preview a manifest (triggers Helix/EDS preview build).
 * Uses the Helix Admin API (not DA Admin API) to trigger preview builds.
 * Requires both Helix API auth and DA content-source auth headers.
 */
export async function previewManifest(org, site, path, ref = 'main') {
  const sheetPath = path.endsWith('.json') ? path : `${path}.json`;
  const url = `${HLX_ADMIN}/preview/${org}/${site}/${ref}/${sheetPath}`;
  const resp = await fetch(url, { method: 'POST', headers: hlxHeaders() });
  if (!resp.ok) throw new Error(`Failed to preview: ${resp.status}`);
  return resp.json();
}

/**
 * Publish a manifest (triggers Helix/EDS publish to live).
 * Uses the Helix Admin API (not DA Admin API) to trigger publish builds.
 * Requires both Helix API auth and DA content-source auth headers.
 */
export async function publishManifest(org, site, path, ref = 'main') {
  const sheetPath = path.endsWith('.json') ? path : `${path}.json`;
  const url = `${HLX_ADMIN}/live/${org}/${site}/${ref}/${sheetPath}`;
  const resp = await fetch(url, { method: 'POST', headers: hlxHeaders() });
  if (!resp.ok) throw new Error(`Failed to publish: ${resp.status}`);
  return resp.json();
}

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
