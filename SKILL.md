---
name: codex-harness-mcp
description: Installs and uses a local Codex MCP server for harness engineering. Use when a user wants Codex CLI workflows with explicit execution contracts, durable file-backed state, raw traces, next-step recovery, compact handoff context, or completion gates before claiming work is done.
license: MIT
compatibility: Requires Node.js 20+ and Codex CLI. The bundled installer registers a dependency-free local stdio MCP server with codex mcp add.
---

# Codex Harness MCP

Use this skill when the user wants Codex to work through a harness-engineering loop instead of a loose prompt.

## Install

Run the installer from this skill directory:

```powershell
node scripts/install-codex-harness-mcp.mjs
```

The installer copies the bundled MCP server to `~/.codex/mcp-servers/codex-harness-mcp` and registers it as `codex-harness` with Codex CLI. The bundled server uses only Node.js built-in modules and does not download packages during installation.

Verify:

```powershell
codex mcp list
```

## Operating Loop

When using the MCP, follow this loop:

1. Call `harness_bootstrap` for the project.
2. Call `harness_create_contract` before implementation.
3. Work only inside the contract's permissions and output paths.
4. Call `harness_record_trace` after attempts, failures, successes, and verification.
5. Call `harness_next_step` when the next action is unclear or after a failure.
6. Call `harness_eval_gate` before claiming the work is complete.
7. Call `harness_compact_context` when handing off or resuming a long task.

## Tool Guide

| Tool | Use |
| --- | --- |
| `harness_bootstrap` | Create `.codex-harness/` in the target project. |
| `harness_create_contract` | Define goal, required inputs, budget, permissions, completion conditions, outputs, and verification commands. |
| `harness_update_state` | Persist focus, status, notes, active contract, and decisions. |
| `harness_record_trace` | Store raw evidence from attempts, failures, verification, and decisions. |
| `harness_next_step` | Recommend the smallest useful next action from the current state. |
| `harness_eval_gate` | Record an explicit completion check. |
| `harness_compact_context` | Generate a compact state summary for resume/handoff. |
| `harness_list` | Inspect current harness state, contracts, and recent traces. |

## Good Prompt

```text
Use codex-harness. Bootstrap the project harness, create a small execution contract, record raw traces after failures or verification, and run the eval gate before saying the task is done.
```

## Notes

- Prefer small contracts over broad ones.
- Keep raw traces detailed; summaries lose the signal needed for later recovery.
- After a failure, narrow the next attempt before broadening scope.
- The MCP writes project-local state under `.codex-harness/`.
