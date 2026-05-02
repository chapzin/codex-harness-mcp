# Codex Harness MCP

**A local harness-engineering control plane for Codex CLI.**

[View on skills.sh](https://skills.sh/chapzin/codex-harness-mcp/codex-harness-mcp)

`codex-harness-mcp` turns loose agent work into an auditable loop: define a bounded contract, query local project knowledge, record research and implementation lessons, capture raw traces, store verification evidence, compare harness profiles with eval runs, record harness-change proposals and promotion decisions, export the harness as natural-language control logic, and run a gate before claiming completion.

![Codex Harness MCP loop](docs/assets/harness-loop.svg)

## At a glance

| Area | What it gives Codex |
| --- | --- |
| Contracts | A small, explicit goal with budgets, permissions, expected outputs, and completion conditions. |
| Persistent memory | Local RAG over research notes, implementation lessons, and project knowledge. |
| Recovery | Raw traces and next-step recommendations after failures or uncertain work. |
| Verification | Structured records for commands/manual checks run outside the MCP server. |
| Harness evals | Profiles, eval cases, eval runs, metrics, comparisons, and regressions. |
| Meta-Harness-lite | Proposal and promotion records for harness changes, with optimization, holdout, regression, risk, and follow-up evidence. |
| Natural-language harness | A portable markdown spec of roles, stages, tools, state semantics, failure taxonomy, and stop rules. |
| Safety posture | Dependency-free local Node server, no shell execution, no remote calls, no credential handling. |

## Why agents need a harness

Long-running agent work often fails in quiet ways:

- context gets compacted
- research is repeated
- failures are summarized too early
- verification evidence disappears
- harness changes are promoted without holdout evidence
- "done" gets claimed before the work is actually checked

This project gives Codex a durable system of record for that work. It does not replace Codex or run tasks for the agent. It gives Codex a local harness: state, contracts, memory, traces, eval records, promotion evidence, and completion gates.

Modern harness-engineering research points in the same direction: the orchestration around an LLM can change task performance dramatically. This MCP focuses on the practical, low-risk layer of that idea: make the loop explicit, make evidence durable, and make harness changes measurable before promoting them.

This MCP gives Codex a small local control plane:

- execution contracts before implementation
- project-local RAG from research and implementation lessons
- raw traces for attempts, failures, decisions, and verification
- structured verification records
- harness profiles and eval run comparisons
- Meta-Harness-lite proposal and promotion-decision records
- natural-language harness spec export
- next-step recovery after a failure
- compact handoff context for long sessions
- explicit completion gates

The goal is not to replace Codex. The goal is to give Codex a durable working memory and a safer operating loop.

## What makes it different

- **Local first:** all project state lives under `.codex-harness/`.
- **Scanner friendly:** the MCP server uses only Node.js built-in modules.
- **No command execution:** verification is recorded, not executed by the MCP.
- **Prompt-injection bounded:** stored user/source text is returned inside `<untrusted-data>` blocks.
- **Harness-aware:** evals, profiles, proposal records, and promotion decisions are first-class data.
- **Portable:** `harness://harness/spec` exports the current loop as a natural-language harness spec.

## Install

Install the skill:

```text
npx skills add chapzin/codex-harness-mcp -g -a codex -y --copy
```

Then run the bundled installer from the installed skill directory, or from this repository:

```text
node scripts/install-codex-harness-mcp.mjs
```

Verify:

```text
codex mcp list
```

Expected MCP entry:

```text
codex-harness  node  ~/.codex/mcp-servers/codex-harness-mcp/src/server.mjs
```

## One-minute workflow

1. Ask Codex to use the harness.
2. Bootstrap or migrate `.codex-harness/`.
3. Query existing local knowledge before repeating research.
4. Create a small contract.
5. Work inside the contract boundaries.
6. Record attempts, failures, decisions, research, lessons, and verification evidence.
7. If changing the harness itself, record profiles, evals, proposals, and promotion decisions.
8. Run the completion gate before saying the work is done.

## Start with this prompt

```text
Use codex-harness. Bootstrap the project, migrate old harness state if needed, query local knowledge, create a small contract, record traces and lessons, record verification evidence, record eval/profile/proposal evidence if changing the harness, and run the eval gate before saying the task is done.
```

For harness optimization work:

```text
Use codex-harness. Record the current harness profile, create optimization and holdout eval cases, store externally run eval results, compare baseline and candidate runs, record a harness proposal, then record a promotion decision only if holdout/regression evidence supports it.
```

For research-heavy implementation:

```text
Use codex-harness. Query local knowledge first. If missing or stale, research externally, store useful sources with harness_record_research, implement inside a small contract, record lessons, and gate completion with verification evidence.
```

## What it adds to Codex

| Capability | What it solves |
| --- | --- |
| Contracts | Keeps work bounded with goals, permissions, budgets, outputs, and completion conditions. |
| Local knowledge RAG | Lets future sessions reuse project research and implementation lessons. |
| Raw traces | Preserves the exact failure or verification signal for recovery. |
| Verification records | Stores command output or manual checks without the MCP running shell commands. |
| Eval cases and runs | Measures harness profile changes with score, verdict, cost, token, time, and regression metadata. |
| Harness profiles | Lets Codex compare minimal, standard, verifier-heavy, research-heavy, and custom harness modes. |
| Meta-Harness-lite records | Stores proposed harness changes, expected gains, baseline/candidate/holdout evidence, accepted risks, and promotion decisions. |
| Natural-language harness spec | Exports roles, stages, adapters, state semantics, failure taxonomy, and stop rules as a portable markdown spec. |
| Next-step recovery | Helps narrow the next attempt after failure instead of thrashing. |
| Completion gates | Makes "done" an explicit evidence check, not a vibe. |
| Handoff context | Produces compact restart context after compaction or session changes. |

## Harness research alignment

The current implementation is aligned with modern harness-engineering practice around contracts, durable artifacts, trace-backed recovery, local knowledge, eval records, Meta-Harness-lite promotion evidence, natural-language harness export, and explicit gates.

It is intentionally a small local control plane, not a full benchmark runner or autonomous Meta-Harness optimizer. The MCP stores and exposes evidence. Codex, the user, or external benchmark tooling still runs commands and evals outside the MCP.

See the detailed compatibility analysis:

- [Harness compatibility analysis - 2026-05-02](docs/harness-compatibility-analysis-2026-05-02.md)
- [Usage playbook](docs/usage-playbook.md)
- [Harness engineering research notes](docs/harness-engineering-research-2026-05-01.md)
- [Marketing launch kit](docs/marketing-launch-kit.md)

Important operating principle: add harness structure only when it improves acceptance evidence, recovery, safety, or handoff quality. Verifiers, extra stages, and multi-candidate search are hypotheses to measure, not automatic wins.

## The harness loop

```text
User request
  -> query project knowledge
  -> create execution contract
  -> implement inside contract boundaries
  -> record traces, research, and lessons
  -> record verification evidence
  -> optionally record eval cases/runs for harness-profile changes
  -> record harness proposal and promotion decision when optimizing the harness
  -> export natural-language harness spec when sharing or porting the loop
  -> evaluate completion gate
  -> compact handoff context when needed
```

## What gets written

The server creates a project-local `.codex-harness/` directory. Typical files include:

```text
.codex-harness/
  state.json
  HARNESS.md
  contracts/
  traces/
  gates/
  knowledge/
  evals/
  harness-profiles/
  harness-proposals/
  promotion-decisions/
  migrations/
```

This makes the agent's operating state inspectable in normal files rather than hidden in a chat transcript.

## MCP surface

### Tools

- `harness_bootstrap`
- `harness_migrate`
- `harness_create_contract`
- `harness_update_state`
- `harness_record_trace`
- `harness_record_verification`
- `harness_record_harness_profile`
- `harness_list_harness_profiles`
- `harness_record_eval_case`
- `harness_record_eval_run`
- `harness_compare_eval_runs`
- `harness_record_harness_proposal`
- `harness_list_harness_proposals`
- `harness_record_promotion_decision`
- `harness_list_promotion_decisions`
- `harness_export_nl_harness`
- `harness_record_knowledge`
- `harness_record_research`
- `harness_record_lesson`
- `harness_query_knowledge`
- `harness_rebuild_knowledge_index`
- `harness_list_knowledge`
- `harness_next_step`
- `harness_eval_gate`
- `harness_compact_context`
- `harness_list`

### Resources

- `harness://state`
- `harness://contracts`
- `harness://contract/{id}`
- `harness://traces/recent`
- `harness://gates/recent`
- `harness://knowledge/index`
- `harness://knowledge/recent`
- `harness://knowledge/item/{id}`
- `harness://evals/cases`
- `harness://evals/runs`
- `harness://eval-case/{id}`
- `harness://eval-run/{id}`
- `harness://harness-profiles`
- `harness://harness-profile/{id}`
- `harness://harness-proposals`
- `harness://harness-proposal/{id}`
- `harness://promotion-decisions`
- `harness://promotion-decision/{id}`
- `harness://harness/spec`

### Prompts

- `harness_bootstrap_project`
- `harness_contract_from_request`
- `harness_failure_recovery`
- `harness_verify_and_close`
- `harness_handoff_context`
- `harness_deep_research`
- `harness_learn_from_implementation`
- `harness_query_knowledge`
- `harness_record_harness_profile`
- `harness_record_eval_case`
- `harness_record_eval_run`
- `harness_compare_eval_runs`
- `harness_propose_harness_change`
- `harness_record_promotion_decision`
- `harness_meta_harness_review`
- `harness_export_nl_harness`

## Local knowledge RAG

The knowledge store is intentionally simple and local. It writes sanitized JSON and Markdown under:

```text
.codex-harness/knowledge/
```

Use it like this:

1. Query first with `harness_query_knowledge`.
2. If the answer is missing or stale, research normally with Codex web/GitHub tools.
3. Store useful findings with `harness_record_research`.
4. After implementation, store reusable lessons with `harness_record_lesson`.
5. Future sessions retrieve that knowledge before planning.

This is not a hosted vector database. It is a dependency-free lexical retrieval layer designed to be transparent, inspectable, and safe for local agent work.

Good examples to store:

- a useful implementation lesson from a failed fix
- an official documentation source used for a decision
- a project-specific convention that future sessions should reuse
- a known verification command and what it proves

## Eval records and harness profiles

Use eval records when changing the harness itself:

1. Record the current profile with `harness_record_harness_profile`.
2. Record a task or failure as an eval case with `harness_record_eval_case`.
3. Run the eval outside the MCP.
4. Store the result with `harness_record_eval_run`.
5. Compare baseline and candidate runs with `harness_compare_eval_runs`.

This keeps the MCP safe: it stores scores, costs, token counts, traces, and regressions, but it does not execute benchmark commands or generated harness code.

## Meta-Harness-lite promotion loop

Use proposal and promotion records when optimizing the harness itself:

1. Record baseline and candidate profiles.
2. Record optimization, holdout, or regression eval cases.
3. Run evals outside the MCP.
4. Store eval results with `harness_record_eval_run`.
5. Record the proposed harness change with `harness_record_harness_proposal`.
6. Promote, reject, hold, or ask for more evidence with `harness_record_promotion_decision`.

This captures the useful part of Meta-Harness practice without letting the MCP execute generated code or benchmark commands.

Promotion decisions should answer four questions:

- Did the candidate improve score, cost, time, or recovery quality?
- Did it preserve holdout behavior?
- Are regressions explicit?
- Are accepted risks and follow-up checks recorded?

## Natural-language harness spec

Use `harness_export_nl_harness` or read `harness://harness/spec` when you want the current harness logic as a portable artifact. The export includes:

- runtime charter
- roles
- stage structure
- adapters and tools
- state semantics
- failure taxonomy
- retry and stop rules
- current project snapshot
- recent proposals and promotion decisions

Stored project data remains inside `<untrusted-data>` blocks.

## Security model

The installer copies a local Node MCP server into `~/.codex/mcp-servers/codex-harness-mcp` and updates Codex `config.toml`.

It does not:

- download runtime packages
- start shells
- alter script execution policy
- run verification commands
- browse the internet
- call remote services
- read credentials

The server uses only Node.js built-in modules. It writes project-local state under `.codex-harness/`.

Stored user/source content is returned inside `<untrusted-data>` boundaries so the agent treats it as evidence, not instructions.

## Version highlights

| Version | Highlights |
| --- | --- |
| `0.1.7` | Meta-Harness-lite proposals, promotion decisions, resources/prompts, state v5. |
| `0.1.6` | Natural-language harness export and `harness://harness/spec`. |
| `0.1.5` | Harness profiles, eval cases, eval runs, and comparisons. |
| `0.1.4` | Persistent local knowledge/RAG, research records, implementation lessons. |
| `0.1.3` | MCP resources/prompts, structured outputs, verification records, migration support. |

## What this is not

Not a replacement agent runtime. Not a hosted memory service. Not a command runner. Not a browser or web research tool. Not a remote telemetry layer.

It is a small local harness for Codex CLI: contracts, traces, local knowledge, verification records, eval records, harness profiles, Meta-Harness-lite promotion records, natural-language spec export, resources, prompts, and gates.

## Development checks

Run all tests:

```text
Get-ChildItem .\tests -Filter *.mjs | Sort-Object Name | ForEach-Object { node $_.FullName; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
```

Key guardrails:

- no runtime dependency downloads
- no installer command execution markers
- prompt-injection boundaries enforced
- resources and prompts exposed safely
- persistent knowledge RAG queryable locally
- eval/profile records persist without command execution
- Meta-Harness-lite proposal/promotion records persist without command execution
- natural-language harness spec export remains prompt-injection bounded
