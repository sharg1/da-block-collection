import { initApp } from './src/app.js';

async function init() {
  // Default mock context for fully standalone local dev (no DA shell parent)
  let context = { org: 'sharg1', repo: 'da-block-collection' };
  let token = '';
  let actions = { sendText: () => {}, closeLibrary: () => {} };

  console.log('[MEP] Starting initialization with default context:', context);

  try {
    // Always attempt the DA SDK — it communicates via postMessage with the
    // parent DA shell, so it works even when the iframe is served from localhost
    // (e.g. da.live?ref=local). Race against a 4s timeout so standalone local
    // dev (no DA shell parent) falls back to mock values instead of hanging.
    // eslint-disable-next-line import/no-unresolved
    console.log('[MEP] Loading DA SDK from https://da.live/nx/utils/sdk.js...');
    const sdkModule = await import('https://da.live/nx/utils/sdk.js');
    console.log('[MEP] SDK module loaded, waiting for SDK promise...');

    const sdk = await Promise.race([
      sdkModule.default,
      new Promise((resolve) => {
        console.log('[MEP] 4s timeout started for SDK');
        setTimeout(() => {
          console.log('[MEP] SDK timeout reached, using defaults');
          resolve(null);
        }, 4000);
      }),
    ]);

    console.log('[MEP] SDK result:', sdk);

    if (sdk?.context) {
      console.log('[MEP] SDK context found:', sdk.context);
      context = sdk.context;
      token = sdk.token;
      actions = sdk.actions;
    } else {
      console.log('[MEP] No SDK context, using default');
    }
  } catch (e) {
    // Running fully standalone without a DA shell — keep mock values
    console.error('[MEP] SDK initialization error:', e);
  }

  console.log('[MEP] Final context being used:', context);
  initApp(document.getElementById('app'), { context, token, actions });
}

init();
