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

The MCP server adds tools for execution contracts, durable state, raw traces, next-step recovery, compact handoff context, and completion gates.

## Why

The useful part of harness engineering is not just "more tools"; it is explicit control logic around the agent:

- bounded contracts before implementation
- file-backed state that survives compaction and restarts
- raw traces for failure recovery
- narrow retry loops
- explicit gates before claiming completion

This package keeps that layer small and local.

## Security

The installer copies a local Node MCP server into `~/.codex/mcp-servers/codex-harness-mcp` and updates `~/.codex/config.toml` with the `codex-harness` MCP entry. It does not start shells, alter script policy, or download runtime packages. The server uses only Node.js built-in modules.

The MCP writes project-local harness state under `.codex-harness/` in whichever project path the tool receives.
