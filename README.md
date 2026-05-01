# Codex Harness MCP

Agent Skill + bundled MCP server for bringing harness engineering workflows to Codex CLI.

Install with the skills CLI:

```text
npx skills add chapzin/codex-harness-mcp -g -a codex -y --copy
```

Then run the bundled installer from the installed skill directory, or ask Codex to use this skill and install the MCP:

```text
node scripts/install-codex-harness-mcp.mjs
```

Verify:

```text
codex mcp list
```

The MCP server adds tools for execution contracts, durable state, raw traces, structured verification records, next-step recovery, compact handoff context, and completion gates. It also exposes MCP resources and prompts for clients that surface project context or reusable workflows.

## Why

The useful part of harness engineering is not just "more tools"; it is explicit control logic around the agent:

- bounded contracts before implementation
- file-backed state that survives compaction and restarts
- raw traces for failure recovery
- structured verification evidence without server-side command execution
- narrow retry loops
- explicit gates before claiming completion

This package keeps that layer small and local.

## Security

The installer copies a local Node MCP server into `~/.codex/mcp-servers/codex-harness-mcp` and updates `~/.codex/config.toml` with the `codex-harness` MCP entry. It does not start shells, alter script policy, or download runtime packages. The server uses only Node.js built-in modules.

The MCP writes project-local harness state under `.codex-harness/` in whichever project path the tool receives.

## MCP surface

Tools:

- `harness_bootstrap`
- `harness_migrate`
- `harness_create_contract`
- `harness_update_state`
- `harness_record_trace`
- `harness_record_verification`
- `harness_next_step`
- `harness_eval_gate`
- `harness_compact_context`
- `harness_list`

Resources:

- `harness://state`
- `harness://contracts`
- `harness://contract/{id}`
- `harness://traces/recent`
- `harness://gates/recent`

Prompts:

- `harness_bootstrap_project`
- `harness_contract_from_request`
- `harness_failure_recovery`
- `harness_verify_and_close`
- `harness_handoff_context`
