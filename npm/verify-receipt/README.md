# @trustbench/verify-receipt

Standalone third-party verifier for [TrustBench](https://trustbench.io) Ed25519-signed receipts.

No TrustBench API calls in the verify path beyond fetching the published public key. Verifies offline once the public key is cached. Optional on-chain verification via `viem` peer dependency.

## Install

```bash
npm install @trustbench/verify-receipt
# Optional, for on-chain verification:
npm install viem
```

## Supported receipt prefixes

Two prefixes are accepted; both route to the same `/receipts/:id` endpoint:

| Prefix | Issued by | Envelope shape |
|---|---|---|
| `rcpt_…` | Phase 3 settlement receipts | `receipt.settlement.{chain, tx_hash, block_number, payer_address, payee_address, amount_atomic, …}` |
| `rrcpt_…` | Phase 4 paywall routing receipts | `receipt.paid.{chain, tx_hash, payer_address, payee_address, amount_atomic, …}` (no `block_number`; verifier confirms the block via the tx_hash lookup) |

The verifier handles both shapes transparently. Code that already worked with `rcpt_` requires no changes.

## Usage (programmatic)

```js
import { verifyReceipt } from '@trustbench/verify-receipt';

// By receipt id (Phase 3 or Phase 4)
const result = await verifyReceipt('rcpt_01KQY7C44GAPSXZPFQYRZ1D10C');
const result2 = await verifyReceipt('rrcpt_01KRGKSZACB4ECRPEQY1VC0F3N');
console.log(result.signatureValid); // true | false
console.log(result.ok);              // signature valid + chain verified (if checkChain)

// From an already-fetched envelope
const result = await verifyReceipt(envelope);

// From a full URL
const result = await verifyReceipt('https://trustbench.io/receipts/rrcpt_...');

// With on-chain verification
const result = await verifyReceipt('rrcpt_...', { checkChain: true });
if (result.chain && result.chain.ok) {
  console.log('Block:', result.chain.block_number);
  console.log('Payer:', result.chain.payer);
  console.log('Amount:', result.chain.amount, '(atomic USDC)');
}
```

## Usage (CLI)

```bash
# Signature-only verification
npx trustbench-verify-receipt rcpt_01KQY7C44GAPSXZPFQYRZ1D10C
npx trustbench-verify-receipt rrcpt_01KRGKSZACB4ECRPEQY1VC0F3N

# Signature + on-chain (requires viem)
npx trustbench-verify-receipt rrcpt_01KRGKSZACB4ECRPEQY1VC0F3N --check-chain

# From a local JSON file
npx trustbench-verify-receipt ./my-receipt.json

# Override the public key URL (useful for local-dev verification)
npx trustbench-verify-receipt ./my-receipt.json --pubkey-url http://localhost:3000/.well-known/trustbench-pubkey
```

Exit codes: `0` valid, `1` bad args, `2` signature invalid, `3` on-chain mismatch, `4` chain check error.

## What gets verified

The signature step:

1. JCS-canonicalize the `receipt` object (RFC 8785-style: sorted keys at every depth, JSON.stringify for primitives, no whitespace).
2. Encode to UTF-8 bytes.
3. Verify the Ed25519 signature against those bytes using the public key fetched from `signature.public_key_url`.

The optional on-chain step (when `--check-chain` is used):

1. Fetch the transaction by `settlement.tx_hash` from a Base RPC.
2. Confirm `tx.to` is the USDC contract (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`).
3. Decode the calldata as `transferWithAuthorization(from, to, value, ...)`.
4. Confirm `from`, `to`, and `value` match the receipt's `payer_address`, `payee_address`, and `amount_atomic`.
5. Confirm the tx was mined successfully and (if present in the receipt) at the claimed `block_number`.

A signature alone tells you *"TrustBench claims this happened with these parameters."* `--check-chain` tells you *"the chain agrees with TrustBench's claim."* Both together is the strongest assurance an external party can get without trusting either side.

## API

### `verifyReceipt(input, options?)`

| Param | Type | |
|---|---|---|
| `input` | `Object \| string` | Receipt envelope, id (`rcpt_...`), full URL, or `.json` path |
| `options.baseUrl` | `string` | Override base URL for id-based input. Default `https://trustbench.io` |
| `options.pubkeyUrl` | `string` | Override the public_key_url from the envelope |
| `options.checkChain` | `boolean` | Also verify on-chain settlement (requires `viem`) |
| `options.rpcUrl` | `string` | RPC URL for chain check. Default `https://mainnet.base.org` |

Returns `Promise<VerifyResult>` — see [`index.d.ts`](./index.d.ts) for the full shape.

### `verifyOnChain(envelope, rpcUrl?)`

Lower-level helper. Same chain check as `verifyReceipt({ checkChain: true })` but skips the signature step. Returns `{ ok, reason?, chain?, tx_hash?, block_number?, payer?, payee?, amount? }`.

### `jcsCanonicalize(obj)`

The exact canonicalization function used internally. Useful for callers that want to reconstruct the bytes that were signed.

## Compatibility

- Node.js >= 18 (for built-in `fetch`).
- `viem >= 2.0.0` peer dependency, optional, only needed for `--check-chain`.
- Mirrors the in-repo reference verifier ([`scripts/verify-receipt.js`](https://github.com/lithvall/TrustBench/blob/main/scripts/verify-receipt.js)) byte-for-byte for the JCS + Ed25519 logic. If they disagree, that's a bug — please open an issue.

## Changelog

### 0.1.1

- Recognize the `rrcpt_` prefix in addition to `rcpt_`. Both route to the same `/receipts/:id` endpoint on the issuer host.
- Verifier reads on-chain settlement data from either `receipt.settlement` (Phase 3) or `receipt.paid` (Phase 4 paywall routing receipts). When `block_number` is absent on the paywall envelope, the verifier still confirms the on-chain transaction via the `tx_hash` lookup and reports `block_check: "block_number not in receipt"` in the chain result.
- No breaking changes. v0.1.0 callers continue working unchanged.

### 0.1.0

- Initial release. Ed25519 signature verification over RFC 8785 JCS-canonical bytes, optional on-chain verification via `viem`.

## License

MIT. See [LICENSE](./LICENSE).

## Links

- [TrustBench](https://trustbench.io) — public registry + non-custodial router
- [Methodology](https://trustbench.io/methodology) — what the probe measures
- [Receipt spec v1.0.0](https://github.com/lithvall/TrustBench/blob/main/receipt-spec-v1.md)
- [Public key](https://trustbench.io/.well-known/trustbench-pubkey)
- [GitHub](https://github.com/lithvall/TrustBench)
