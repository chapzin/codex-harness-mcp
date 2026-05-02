# Multi-Client MCP Setup

`codex-harness-mcp` is a local stdio MCP server. The server process is always the same:

```text
node <installed-codex-harness-mcp>/src/server.mjs
```

The difference between clients is only the configuration file shape. The installer can now copy the local dependency-free server and write the right config for the major MCP-capable coding clients.

## Quick install

Codex only:

```text
node scripts/install-codex-harness-mcp.mjs
```

All supported clients:

```text
node scripts/install-codex-harness-mcp.mjs --clients all --scope auto --project .
```

Selected clients:

```text
node scripts/install-codex-harness-mcp.mjs --clients codex,claude-code,opencode,kilo,gemini,cursor,vscode,cline,windsurf,roo --scope auto --project .
```

List supported clients:

```text
node scripts/install-codex-harness-mcp.mjs --list-clients
```

## Scope behavior

`--scope auto` is the safest default for broad compatibility:

- project config where the client has a stable project file
- global config for clients whose MCP config is global-only in practice
- Codex still writes to `CODEX_HOME` or `~/.codex/config.toml`

Project-scoped files written by `--scope auto`:

| Client | File |
| --- | --- |
| Claude Code | `.mcp.json` |
| OpenCode | `opencode.json` |
| Kilo CLI / Kilo Code | `.kilo/kilo.jsonc` |
| Gemini CLI | `.gemini/settings.json` |
| Cursor | `.cursor/mcp.json` |
| VS Code / GitHub Copilot | `.vscode/mcp.json` |
| Roo Code | `.roo/mcp.json` |

Global-scoped files written by `--scope auto`:

| Client | File |
| --- | --- |
| Cline | `~/.cline/data/settings/cline_mcp_settings.json` |
| Windsurf Cascade | `~/.codeium/windsurf/mcp_config.json` |

Clients with known global paths can also use `--scope global`:

```text
node scripts/install-codex-harness-mcp.mjs --clients opencode,kilo,gemini,cursor,cline,windsurf --scope global
```

Known global files:

| Client | File |
| --- | --- |
| OpenCode | `~/.config/opencode/opencode.json` |
| Kilo CLI / Kilo Code | `~/.config/kilo/kilo.jsonc` |
| Gemini CLI | `~/.gemini/settings.json` |
| Cursor | `~/.cursor/mcp.json` |
| Cline | `~/.cline/data/settings/cline_mcp_settings.json` |
| Windsurf Cascade | `~/.codeium/windsurf/mcp_config.json` |

Roo Code note: Roo project config is emitted as a best-effort compatibility target because `.roo/mcp.json` is widely used by Roo MCP integrations. The official Roo Code docs currently announce that Roo Code products shut down on May 15, 2026, so treat it as migration support rather than the strongest long-term target.

## Generated config shapes

### Claude Code

Claude Code project config uses `.mcp.json`:

```json
{
  "mcpServers": {
    "codex-harness": {
      "type": "stdio",
      "command": "node",
      "args": ["C:/Users/you/.codex/mcp-servers/codex-harness-mcp/src/server.mjs"]
    }
  }
}
```

For user/global Claude Code config, use Claude Code's own command because it stores user scope internally:

```text
claude mcp add --transport stdio codex-harness -- node C:/Users/you/.codex/mcp-servers/codex-harness-mcp/src/server.mjs
```

### OpenCode

OpenCode uses an `mcp` object:

```json
{
  "mcp": {
    "codex-harness": {
      "type": "local",
      "command": ["node", "C:/Users/you/.codex/mcp-servers/codex-harness-mcp/src/server.mjs"],
      "enabled": true
    }
  }
}
```

### Kilo CLI / Kilo Code

Kilo uses the same local MCP shape as OpenCode:

```json
{
  "mcp": {
    "codex-harness": {
      "type": "local",
      "command": ["node", "C:/Users/you/.codex/mcp-servers/codex-harness-mcp/src/server.mjs"],
      "enabled": true
    }
  }
}
```

### Gemini CLI

Gemini CLI uses `mcpServers` in `settings.json`:

```json
{
  "mcpServers": {
    "codex-harness": {
      "command": "node",
      "args": ["C:/Users/you/.codex/mcp-servers/codex-harness-mcp/src/server.mjs"],
      "timeout": 30000,
      "trust": false
    }
  }
}
```

### Cursor

Cursor uses `.cursor/mcp.json` or `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "codex-harness": {
      "command": "node",
      "args": ["C:/Users/you/.codex/mcp-servers/codex-harness-mcp/src/server.mjs"]
    }
  }
}
```

### VS Code / GitHub Copilot

VS Code uses `.vscode/mcp.json` with a `servers` object:

```json
{
  "servers": {
    "codexHarness": {
      "type": "stdio",
      "command": "node",
      "args": ["C:/Users/you/.codex/mcp-servers/codex-harness-mcp/src/server.mjs"]
    }
  }
}
```

### Cline

Cline uses `cline_mcp_settings.json`:

```json
{
  "mcpServers": {
    "codex-harness": {
      "command": "node",
      "args": ["C:/Users/you/.codex/mcp-servers/codex-harness-mcp/src/server.mjs"]
    }
  }
}
```

### Windsurf Cascade

Windsurf uses `mcp_config.json`:

```json
{
  "mcpServers": {
    "codex-harness": {
      "command": "node",
      "args": ["C:/Users/you/.codex/mcp-servers/codex-harness-mcp/src/server.mjs"]
    }
  }
}
```

### Roo Code

Roo Code project config uses `.roo/mcp.json`:

```json
{
  "mcpServers": {
    "codex-harness": {
      "command": "node",
      "args": ["C:/Users/you/.codex/mcp-servers/codex-harness-mcp/src/server.mjs"]
    }
  }
}
```

## Why this helps adoption

Different agents now get the same harness surface:

- contracts
- local knowledge/RAG
- traces
- verification evidence
- observability reports
- eval records
- harness proposals
- promotion decisions
- natural-language harness spec
- completion gates

This turns `codex-harness-mcp` from a Codex-only helper into a portable local harness for the broader MCP coding-agent ecosystem.

## Security notes

The multi-client installer still does not execute external client CLIs. It only:

1. copies the bundled dependency-free local MCP server
2. writes or merges JSON/TOML config files
3. points clients at the local `node .../server.mjs` command

It does not download packages, run package managers, invoke shells, browse the web, call remote services, or handle credentials.

## Source references

- Claude Code MCP docs: https://code.claude.com/docs/en/mcp
- OpenCode MCP docs: https://opencode.ai/docs/mcp-servers/
- Kilo CLI MCP docs: https://kilo.ai/docs/automate/mcp/using-in-cli
- Kilo Code MCP docs: https://kilo.ai/docs/automate/mcp/using-in-kilo-code
- Gemini CLI MCP docs: https://google-gemini.github.io/gemini-cli/docs/tools/mcp-server.html
- Cursor MCP docs: https://docs.cursor.com/en/context/model-context-protocol
- VS Code MCP config docs: https://code.visualstudio.com/docs/copilot/reference/mcp-configuration
- Cline MCP docs: https://docs.cline.bot/mcp/adding-and-configuring-servers
- Windsurf MCP docs: https://docs.windsurf.com/windsurf/cascade/mcp
- Roo Code product status: https://docs.roocode.com/
