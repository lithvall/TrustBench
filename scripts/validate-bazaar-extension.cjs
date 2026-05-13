// scripts/validate-bazaar-extension.cjs — Stone 4 pre-flight check (plain CJS)
// =============================================================================
// Why CJS not TS: the Linux sandbox's node_modules has Windows-built esbuild
// binaries (npm install was run on Windows). tsx can't transform. Plain Node
// require() of the package's CJS build works regardless of platform.
//
// Goal: run @x402/extensions' validateDiscoveryExtension against the LIVE
// production /route 402 response's extensions.bazaar block. If the facilitator's
// schema validator would reject our declaration, Stone 0's fix wouldn't help.
//
// Cost: $0. One outbound HTTP request to https://trustbench.io/route.
// =============================================================================

const https = require('https');

function fetchJson(url, init) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        method: init.method,
        hostname: u.hostname,
        path: u.pathname + (u.search || ''),
        headers: init.headers || {},
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null });
          } catch (e) {
            reject(new Error(`JSON parse failed: ${e.message}\n${data.slice(0, 200)}`));
          }
        });
      },
    );
    req.on('error', reject);
    if (init.body) req.write(init.body);
    req.end();
  });
}

async function main() {
  console.log('[validate] fetching live /route 402 body from production...');
  const { status, body } = await fetchJson('https://trustbench.io/route', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      capability: 'data',
      max_price: '10000',
      payer_address: '0x0000000000000000000000000000000000000000',
    }),
  });

  if (status !== 402) {
    console.error(`[validate] FATAL: expected 402, got ${status}. Body:`);
    console.error(JSON.stringify(body, null, 2).slice(0, 500));
    return 1;
  }
  if (!body || !body.extensions || !body.extensions.bazaar) {
    console.error('[validate] FATAL: 402 body missing extensions.bazaar. Body keys:', Object.keys(body || {}));
    return 1;
  }

  const bazaar = body.extensions.bazaar;
  console.log('[validate] extracted extensions.bazaar (truncated):');
  console.log(JSON.stringify(bazaar, null, 2).slice(0, 1800));
  console.log('... [truncated for readability]\n---');

  // Require the @x402/extensions CJS build. The bazaar subpath maps to
  // dist/cjs/bazaar/index.js per package.json exports.
  let validateDiscoveryExtension;
  try {
    // Use the package.json subpath export path
    const mod = require('@x402/extensions/bazaar');
    validateDiscoveryExtension = mod.validateDiscoveryExtension;
    if (typeof validateDiscoveryExtension !== 'function') {
      console.error('[validate] FATAL: @x402/extensions/bazaar.validateDiscoveryExtension is not a function. Exports:', Object.keys(mod));
      return 1;
    }
  } catch (e) {
    console.error('[validate] subpath import failed, trying direct CJS path...');
    try {
      const mod = require('@x402/extensions/dist/cjs/bazaar/index.js');
      validateDiscoveryExtension = mod.validateDiscoveryExtension;
      if (typeof validateDiscoveryExtension !== 'function') {
        console.error('[validate] FATAL: direct path import also failed. Exports:', Object.keys(mod));
        return 1;
      }
    } catch (e2) {
      console.error('[validate] FATAL: both import paths failed.', e2.message);
      return 1;
    }
  }

  const result = validateDiscoveryExtension(bazaar);
  console.log('[validate] validateDiscoveryExtension result:');
  console.log(JSON.stringify(result, null, 2));

  if (result.valid === true) {
    console.log('\n✅ valid: true — Stone 4 ELIMINATED. Safe to proceed to Stone 0 patch.');
    return 0;
  }
  console.error('\n❌ valid: false — facilitator would silently warn and skip cataloging.');
  console.error('Stone 4 is the (or A) blocker. Do NOT proceed to Stone 0 smoke until schema validates.');
  if (result.errors && result.errors.length > 0) {
    console.error('\nErrors:');
    for (const err of result.errors) console.error('  -', err);
  }
  return 2;
}

main().then((code) => process.exit(code)).catch((e) => {
  console.error('[validate] CRASH:', e.stack || e);
  process.exit(1);
});
