# Verified x402 Payment

Verify-after-pay template for any agent making x402 payments. The agent pays an x402 provider directly (using Agentic Wallet, Pay.sh, or any x402 SDK), then calls TrustBench POST /verify to get cryptographic confirmation that the payment settled on-chain. Use this when the agent needs proof of payment for audit, reimbursement, or multi-agent accountability.

## Who this is for

Any agent that pays x402 providers and needs to prove those payments happened. Works with any x402 SDK (Coinbase Agentic Wallet, Pay.sh, custom). No TrustBench API key needed.

## Prerequisites

Agent runtime with x402 payment support. Wallet funded with USDC on Base.

## Cost

Free. POST /verify is a public endpoint with no auth and no payment required.

## What you get

For each payment, a JSON object with:
- `signature_valid` (boolean): Ed25519 signature on the receipt checks out against TrustBench's published public key
- `on_chain_verified` (boolean): the transaction exists on Base, the payer/payee/amount match, and it succeeded
- `pubkey_url`: where to fetch the public key for independent offline re-verification

## Prompt

After every x402 payment you make, verify the payment settled on-chain by calling TrustBench.

For each x402 call:

1. Pay the x402 provider normally using your wallet SDK. Collect the response, which contains the receipt envelope (the `{receipt, signature}` JSON).

2. POST `https://trustbench.io/verify` with the receipt envelope:

   ```json
   {
     "receipt_json": {
       "receipt": { ... },
       "signature": { ... }
     }
   }
   ```

   Or, if you only have the receipt ID (e.g. from an `X-Receipt-Id` response header):

   ```json
   {
     "receipt_id": "rrcpt_01KRN8HYPPRD1MS9JE7045S77Q"
   }
   ```

3. Parse the response. Check `signature_valid` and `on_chain_verified`. If both are true, the payment is cryptographically confirmed. If either is false, inspect `signature_detail` or `chain_detail` for the failure reason.

4. Append the verification result to your output so the user (or a supervising agent) can see proof of every payment:

   ```json
   {
     "payment": {
       "provider": "https://example-x402-provider.com/api",
       "amount_usdc": "0.005",
       "receipt_id": "rrcpt_...",
       "signature_valid": true,
       "on_chain_verified": true
     }
   }
   ```

Include verification results with every response that involved a payment. The user should be able to see, at a glance, that every payment was confirmed on-chain.

## Example flow

Task: "Research the latest AI funding rounds using x402 data providers and verify every payment."

```
Agent: I'll search for AI funding data and verify each payment.

Step 1: Pay Exa search via x402
  → Received receipt rrcpt_01EXAMPLE...
  → POST https://trustbench.io/verify {"receipt_id": "rrcpt_01EXAMPLE..."}
  → Result: signature_valid=true, on_chain_verified=true

Step 2: Pay QuickNode data query via x402
  → Received receipt rrcpt_01EXAMPLE2...
  → POST https://trustbench.io/verify {"receipt_id": "rrcpt_01EXAMPLE2..."}
  → Result: signature_valid=true, on_chain_verified=true

Output:
{
  "findings": "...",
  "payments": [
    {"provider": "exa.ai", "amount": "$0.01", "verified": true},
    {"provider": "x402.quicknode.com", "amount": "$0.005", "verified": true}
  ],
  "total_spend_usdc": "0.015",
  "all_payments_verified": true
}
```
