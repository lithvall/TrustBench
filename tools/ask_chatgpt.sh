#!/usr/bin/env bash
# ask_chatgpt.sh — get an INDEPENDENT opinion from ChatGPT via the codex CLI, driven by Claude.
#
# Ported to TrustBench 2026-08-14 from Frisyr (MethodM/style_mvp/tools/ask_chatgpt.sh).
# Same auth, same binary, same discipline. Differences from the Frisyr original:
#   * ROOT points at TrustBench.
#   * The ground-truth IMAGE block is removed. Frisyr grades renders against a reference
#     photo + 8-view turntable; TrustBench is a text/strategy project with no visual ground
#     truth. EXTRA_IMG is kept for the occasional screenshot (a dashboard, a competitor page).
#
# DISCIPLINE — the protocol is GENUINE DIALECTIC, not critique-of-my-plan. See
# tools/CROSS_LLM_WORKFLOW.md. The short version:
#   1. Claude writes its OWN answer FIRST, to out/chatgpt/<topic>_claude.md.
#   2. The prompt to codex is OPEN-ENDED with NO Claude solution embedded.
#   3. Run this script.
#   4. Debate + converge (rebuttal round on the load-bearing disagreement).
#   5. Write out/chatgpt/<topic>_converged.md with BOTH positions and the convergence.
# Do NOT hand codex a finished plan to react to — it biases it into reacting to Claude's
# framing instead of generating its own answer, which destroys the entire point.
#
# codex output is INPUT, not ground truth. Spot-check any load-bearing claim against the
# repo before acting on it — the 2026-08-14 session is a long lesson in claims that outran
# their evidence, and an external model's confident prose is not exempt.
#
# SANDBOX: read-only. codex may READ the repo to ground its answer; it cannot modify files,
# run network calls, or touch anything. Safe unattended.
#
# AUTH: ChatGPT login stored in ~/.codex (Plus/Pro, no per-call cost). Verified working
# 2026-08-14: codex-cli 0.139.0, "Logged in using ChatGPT".
#
# NOTE: codex lives in WSL. From Windows/Git Bash, call this through wsl:
#   wsl -e bash -lc '/mnt/c/Users/Lithv/Documents/Claude/Projects/TrustBench/tools/ask_chatgpt.sh ...'
#
# Usage:
#   tools/ask_chatgpt.sh PROMPT_FILE [OUT_FILE] [MODEL] [EFFORT]
#   echo "one-off question" | tools/ask_chatgpt.sh - [OUT_FILE]
set -euo pipefail

CODEX="$HOME/.local/share/codex/bin/codex"
ROOT="/mnt/c/Users/Lithv/Documents/Claude/Projects/TrustBench"
PROMPT_SRC="${1:?usage: ask_chatgpt.sh PROMPT_FILE [OUT_FILE] [MODEL] [EFFORT]}"
OUT="${2:-$ROOT/out/chatgpt/last_reply.md}"
# Highest usable on a ChatGPT-Pro codex auth (verified in Frisyr 2026-06-18): gpt-5.5 @ xhigh.
# gpt-5.5-pro is NOT available via codex with a ChatGPT account (400; needs metered API).
MODEL="${3:-gpt-5.5}"
EFFORT="${4:-xhigh}"   # low|medium|high|xhigh
mkdir -p "$(dirname "$OUT")"

if [ ! -x "$CODEX" ]; then echo "codex not found at $CODEX" >&2; exit 1; fi
if [ "$PROMPT_SRC" = "-" ]; then PROMPT="$(cat)"; else PROMPT="$(cat "$PROMPT_SRC")"; fi

# EXTRA_IMG: colon-separated image paths (screenshots of a competitor page, a dashboard, etc.).
IMG_ARGS=()
if [ -n "${EXTRA_IMG:-}" ]; then
  IFS=':' read -ra _EX <<< "$EXTRA_IMG"
  for f in "${_EX[@]}"; do [ -f "$f" ] && IMG_ARGS+=( -i "$f" ); done
fi

ARGS=( exec --skip-git-repo-check -s read-only -C "$ROOT" --color never -o "$OUT"
       -m "$MODEL" -c "model_reasoning_effort=$EFFORT" "${IMG_ARGS[@]}" )

echo "[ask_chatgpt] codex exec (read-only) model=$MODEL effort=$EFFORT imgs=$(( ${#IMG_ARGS[@]} / 2 )) ..." >&2
# Prompt via STDIN, not a positional: -i is greedy (<FILE>...) so a trailing positional
# would be swallowed as another image. -i flags go LAST.
printf "%s" "$PROMPT" | "$CODEX" "${ARGS[@]}"
echo >&2
echo "[ask_chatgpt] final reply written to: $OUT" >&2
