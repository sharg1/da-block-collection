import { initApp } from './src/app.js';

async function init() {
  // Default mock context for fully standalone local dev (no DA shell parent)
  let context = { org: 'sharg1', repo: 'da-block-collection' };
  let token = '';
  let actions = { sendText: () => {}, closeLibrary: () => {} };

  try {
    // Always attempt the DA SDK — it communicates via postMessage with the
    // parent DA shell, so it works even when the iframe is served from localhost
    // (e.g. da.live?ref=local). Race against a 4s timeout so standalone local
    // dev (no DA shell parent) falls back to mock values instead of hanging.
    // eslint-disable-next-line import/no-unresolved
    const sdkModule = await import('https://da.live/nx/utils/sdk.js');
    const sdk = await Promise.race([
      sdkModule.default,
      new Promise((resolve) => { setTimeout(() => resolve(null), 4000); }),
    ]);
    if (sdk?.context) {
      context = sdk.context;
      token = sdk.token;
      actions = sdk.actions;
    }
  } catch (e) {
    // Running fully standalone without a DA shell — keep mock values
  }

  initApp(document.getElementById('app'), { context, token, actions });
}

init();
