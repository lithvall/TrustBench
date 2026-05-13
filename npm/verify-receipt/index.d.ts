// @trustbench/verify-receipt — type declarations

export interface VerifyOptions {
  /** Override base URL when input is a receipt id. Default: https://trustbench.io */
  baseUrl?: string;
  /** Override the public_key_url from the envelope. */
  pubkeyUrl?: string;
  /** Also verify on-chain settlement. Requires `viem` peer dependency. */
  checkChain?: boolean;
  /** RPC URL for chain verification. Default: https://mainnet.base.org */
  rpcUrl?: string;
}

export interface VerifyChainResult {
  ok: boolean;
  reason?: string;
  chain?: string;
  tx_hash?: string;
  block_number?: number;
  block_check?: string;
  payer?: string;
  payee?: string;
  amount?: string;
}

export interface VerifyResult {
  /** True iff signature is valid AND (chain is verified OR checkChain was not requested). */
  ok: boolean;
  signatureValid: boolean;
  /** Undefined when checkChain wasn't requested. */
  onChainVerified: boolean | undefined;
  receipt: any | null;
  keyId: string | null;
  publicKeyUrl: string | null;
  publicKeyUrlUsed: string | null;
  canonicalLength: number | null;
  /** Detailed chain-verification result (when checkChain was used). */
  chain: VerifyChainResult | null;
  errors: string[];
}

/**
 * Verify a TrustBench Ed25519-signed receipt's signature, optionally also
 * confirming on-chain settlement.
 *
 * @param input Receipt envelope object, receipt id (`rcpt_...` for Phase 3
 *   settlement receipts or `rrcpt_...` for Phase 4 paywall routing receipts),
 *   full URL, or path to a JSON file.
 * @param options Optional flags (see VerifyOptions).
 */
export function verifyReceipt(
  input: object | string,
  options?: VerifyOptions
): Promise<VerifyResult>;

/**
 * Verify the on-chain settlement claim of a receipt. Requires viem.
 */
export function verifyOnChain(
  envelope: object,
  rpcUrl?: string
): Promise<VerifyChainResult>;

/**
 * RFC 8785-style JCS canonicalization. Used internally by verifyReceipt.
 * Exposed for callers that want to reconstruct the exact bytes that were
 * signed, e.g. when re-signing a receipt or testing tamper detection.
 */
export function jcsCanonicalize(obj: unknown): string;
