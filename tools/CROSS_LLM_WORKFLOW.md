# Cross-LLM dialectic via codex (Claude drives both sides)

Ported to TrustBench 2026-08-14 from Frisyr (`MethodM/style_mvp/tools/CROSS_LLM_WORKFLOW.md`). Same binary, same auth, same protocol. Verified working here: codex-cli 0.139.0, "Logged in using ChatGPT", smoke test returned a correct read of `STANCE.md`.

## The protocol — GENUINE DIALECTIC, not critique-of-my-plan (ENFORCED, Johan 2026-06-18)

The premise: Claude and ChatGPT/codex **independently** solve the same problem, then **debate and converge**. Do NOT hand codex a finished Claude plan to react to — that biases it into reacting to Claude's framing instead of generating its own answer. Both halves are mandatory: **(A) pose the problem OPEN-ENDED**, and **(B) Claude independently writes its OWN answer to the SAME questions.**

1. **Claude writes its OWN answer FIRST** → `out/chatgpt/<topic>_claude.md`. Independent answer to the load-bearing questions, BEFORE and SEPARATE from the codex prompt. Do not send this to codex.
2. **Claude poses the problem OPEN-ENDED** → `out/chatgpt/<topic>_PROMPT.md`: real situation + constraints + goal + the load-bearing QUESTIONS + which repo files to read. **No Claude solution embedded.** Open-ended "how should we…", never "critique my plan that does X".
3. **Claude calls `tools/ask_chatgpt.sh`** → codex `gpt-5.5 @ xhigh`, read-only sandbox over the real repo.
4. **Debate + converge.** Lay both answers side by side: where they agree, where they diverge, and WHY. Fire a rebuttal round on the load-bearing disagreement. Converge on what best suits TrustBench — Claude's, codex's, a synthesis, or a third option neither held.
5. **Document** → `out/chatgpt/<topic>_converged.md` with BOTH positions, the agreements/disagreements, and the convergence rationale. Bring Johan **the converged plan + the disagreement**, not codex's raw dump.

Keep prompts open-ended every time. Future sessions MUST follow this same independent-then-converge protocol.

## codex output is INPUT, not ground truth

Spot-check any **load-bearing** claim against the repo before acting on it. The 2026-08-14 session is a long lesson in claims that outran their evidence — four in one day, one of which froze a decision for six weeks. An external model's confident prose is not exempt from that; if anything it is more dangerous, because it arrives without the provenance a repo grep has.

Where codex asserts a fact about TrustBench, verify it. Where it asserts a fact about the outside world, mark it `status_source: reported` until checked.

## When to invoke

- Open-ended strategy calls where Claude has a view but the view is unvalidated ("what should the path forward be?").
- Any commitment that is expensive to reverse: pricing, public positioning, a pillar decision, a partnership shape.
- After a decision has been made on thin evidence and would benefit from an independent attempt at the same problem.
- **Not** for routine implementation, bug fixes, or anything with a verifiable right answer. The loop is for judgement under uncertainty, not for facts a grep can settle.

## Usage

```bash
wsl -e bash -lc '/mnt/c/Users/Lithv/Documents/Claude/Projects/TrustBench/tools/ask_chatgpt.sh /mnt/c/.../out/chatgpt/topic_PROMPT.md /mnt/c/.../out/chatgpt/topic_codex.md'
```

codex lives in WSL; TrustBench work happens on Windows, so calls route through `wsl -e bash -lc`. Defaults: `gpt-5.5` @ `xhigh` (the max on a ChatGPT-Pro codex auth; `gpt-5.5-pro` needs metered API and returns 400 here). Override per call with positional args 3 and 4. `EXTRA_IMG=path1:path2` attaches screenshots.

`out/` is gitignored — codex replies and working drafts stay local. Anything worth keeping goes into `decisions.md` or a dated doc.

## Auth (one-time, Johan only — already done)

```bash
~/.local/bin/codex login          # or: codex login --device-auth
~/.local/bin/codex login status   # verify
```

Token persists in `~/.codex`. After that Claude calls the script unattended.
