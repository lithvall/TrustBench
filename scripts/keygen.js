// scripts/keygen.js
// Generates a fresh Ed25519 keypair for TrustBench scorecard signing.
//
// Usage:
//   npm run keygen
//
// The output is two PEM blocks ready to paste into your .env (or Railway env
// vars). The PRIVATE key MUST stay secret. The PUBLIC key is meant to be
// published — TrustBench serves it at /.well-known/trustbench-pubkey so any
// third party can verify scorecards.

import crypto from 'crypto';

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const pubPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

// Env vars don't preserve newlines — escape them as literal \n so the value
// can live on a single line in .env or Railway's UI. The runtime un-escapes.
const oneLine = (pem) => pem.trim().replace(/\n/g, '\\n');

console.log('# ---------------------------------------------------------------');
console.log('# TrustBench Ed25519 keypair — generated at', new Date().toISOString());
console.log('# Paste both lines into .env (and into Railway env vars).');
console.log('# Keep the PRIVATE key secret. The PUBLIC key is meant to be published.');
console.log('# ---------------------------------------------------------------');
console.log('');
console.log(`TRUSTBENCH_SIGNING_PUBLIC_KEY="${oneLine(pubPem)}"`);
console.log(`TRUSTBENCH_SIGNING_PRIVATE_KEY="${oneLine(privPem)}"`);
console.log('');
console.log('# Public key (also served at /.well-known/trustbench-pubkey):');
console.log(pubPem);
