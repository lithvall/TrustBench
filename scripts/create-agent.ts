// scripts/create-agent.ts — provision a new agent and emit a single API key.
//
// Usage:
//   npm run create-agent -- <email> [display_name] [live|test]
//
// The plaintext key is printed exactly once and never persisted in cleartext —
// only its first 12 chars (key_prefix, indexed) and an argon2id digest go into
// api_keys. Spec lives in phase3-agent-identity.md.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import * as argon2 from '@node-rs/argon2';
import { randomBytes } from 'crypto';

// Match the env var the rest of the codebase uses (see src/scorer.ts).
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// Crockford Base32 alphabet — 32 symbols, no visually-confusing chars (no I/O/1/0).
// 256 % 32 === 0, so masking each byte with 0x1F is unbiased.
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Generate a TrustBench API key.
 *
 * Layout: `tb_live_` (8) + 32 Crockford-base32 chars = 40 total.
 * Each output char encodes 5 bits drawn from a fresh random byte. We sample
 * 32 bytes (256 bits of OS entropy) and use the low 5 bits of each — over-
 * sampling is fine and keeps the implementation a single mask op.
 */
function generateApiKey(mode: 'live' | 'test'): string {
  const prefix = mode === 'live' ? 'tb_live_' : 'tb_test_';
  const bytes = randomBytes(32);
  let body = '';
  for (let i = 0; i < 32; i++) {
    body += CROCKFORD[bytes[i] & 0x1f];
  }
  return prefix + body; // 40 chars total
}

async function main() {
  const email = process.argv[2];
  const displayName = process.argv[3] || 'Unnamed Agent';
  const modeArg = (process.argv[4] || 'test').toLowerCase();

  if (!email) {
    console.error('Usage: npm run create-agent -- <email> [display_name] [live|test]');
    process.exit(1);
  }
  if (modeArg !== 'live' && modeArg !== 'test') {
    console.error(`Invalid mode "${modeArg}". Must be "live" or "test".`);
    process.exit(1);
  }
  const mode = modeArg as 'live' | 'test';

  const plaintextKey = generateApiKey(mode);
  const keyPrefix = plaintextKey.slice(0, 12); // matches the lookup index in api_keys
  const keyHash = await argon2.hash(plaintextKey);

  // Two-step insert: agents first so we have the FK, then api_keys.
  // No transaction here — if the api_keys insert fails we leave a parentless
  // agent row, but the user just re-runs and the unique-email constraint
  // points them at it. Solo-founder MVP, not multi-tenant SaaS.
  const { data: agent, error: agentError } = await supabase
    .from('agents')
    .insert({ email, display_name: displayName, mode })
    .select('id')
    .single();

  if (agentError) throw agentError;

  const { error: keyError } = await supabase
    .from('api_keys')
    .insert({
      agent_id: agent.id,
      key_prefix: keyPrefix,
      key_hash: keyHash,
      mode,
      label: `created-${new Date().toISOString().slice(0, 10)}`
    });

  if (keyError) throw keyError;

  console.log('✅ Agent and API key created');
  console.log('  email      :', email);
  console.log('  agent_id   :', agent.id);
  console.log('  mode       :', mode);
  console.log('  key_prefix :', keyPrefix);
  console.log('');
  console.log('API key (shown once — store it now):');
  console.log('  ' + plaintextKey);
  console.log('');
  console.log('Use as:  Authorization: Bearer ' + plaintextKey);
}

main().catch((err) => {
  console.error('❌ create-agent failed:', err?.message || err);
  process.exit(1);
});