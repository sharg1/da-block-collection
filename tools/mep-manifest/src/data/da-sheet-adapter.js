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
