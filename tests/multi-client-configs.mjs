import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const clientConfigs = await import("../scripts/lib/mcp-client-configs.mjs");

const {
  CLIENT_ALIASES,
  MCP_SERVER_NAME,
  createClientConfigFragment,
  resolveClientIds,
  writeClientConfig
} = clientConfigs;

if (MCP_SERVER_NAME !== "codex-harness") {
  throw new Error("Unexpected MCP server name.");
}

for (const expected of [
  "claude-code",
  "opencode",
  "kilo",
  "gemini",
  "cursor",
  "vscode",
  "cline",
  "windsurf",
  "roo"
]) {
  if (!CLIENT_ALIASES.has(expected)) {
    throw new Error(`Missing client support: ${expected}`);
  }
}

const serverPath = path.join(os.tmpdir(), "codex-harness-mcp", "src", "server.mjs");
const resolvedServerPath = path.resolve(serverPath);

const claude = createClientConfigFragment("claude-code", { serverPath });
if (claude.config.mcpServers[MCP_SERVER_NAME].type !== "stdio") {
  throw new Error("Claude Code config should use stdio transport.");
}
if (claude.config.mcpServers[MCP_SERVER_NAME].args[0] !== resolvedServerPath) {
  throw new Error("Claude Code config should point at the server path.");
}

const opencode = createClientConfigFragment("opencode", { serverPath });
if (opencode.config.mcp[MCP_SERVER_NAME].type !== "local") {
  throw new Error("OpenCode config should use local MCP transport.");
}
if (opencode.config.mcp[MCP_SERVER_NAME].command[1] !== resolvedServerPath) {
  throw new Error("OpenCode config should use command array with the server path.");
}

const kilo = createClientConfigFragment("kilo-cli", { serverPath });
if (kilo.config.mcp[MCP_SERVER_NAME].command[0] !== "node") {
  throw new Error("Kilo config should use node as the local command.");
}

const gemini = createClientConfigFragment("gemini-cli", { serverPath });
if (gemini.config.mcpServers[MCP_SERVER_NAME].trust !== false) {
  throw new Error("Gemini config should keep the MCP server untrusted by default.");
}

const vscode = createClientConfigFragment("vscode", { serverPath });
if (!vscode.config.servers.codexHarness || vscode.config.servers.codexHarness.type !== "stdio") {
  throw new Error("VS Code config should use servers.codexHarness with stdio transport.");
}

const all = resolveClientIds(["all"]);
for (const expected of ["claude-code", "opencode", "kilo", "gemini", "cursor", "vscode", "cline", "windsurf", "roo"]) {
  if (!all.includes(expected)) {
    throw new Error(`resolveClientIds(all) did not include ${expected}.`);
  }
}

const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "codex-harness-client-project-"));
const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-harness-client-home-"));

try {
  await fs.writeFile(
    path.join(projectPath, "opencode.json"),
    `${JSON.stringify({ "$schema": "opencode-config-json", model: "anthropic/test", mcp: { existing: { type: "remote", url: "example.invalid/mcp", enabled: false } } }, null, 2)}\n`,
    "utf8"
  );

  const opencodeWrite = await writeClientConfig({
    clientId: "opencode",
    scope: "project",
    projectPath,
    homeDir,
    serverPath
  });
  const opencodeConfig = JSON.parse(await fs.readFile(opencodeWrite.configPath, "utf8"));
  if (!opencodeConfig.mcp.existing || !opencodeConfig.mcp[MCP_SERVER_NAME]) {
    throw new Error("OpenCode project config did not preserve existing MCP entries while adding codex-harness.");
  }
  if (opencodeConfig.model !== "anthropic/test") {
    throw new Error("OpenCode project config did not preserve unrelated settings.");
  }

  const claudeWrite = await writeClientConfig({
    clientId: "claude",
    scope: "project",
    projectPath,
    homeDir,
    serverPath
  });
  const claudeConfig = JSON.parse(await fs.readFile(claudeWrite.configPath, "utf8"));
  if (!claudeConfig.mcpServers[MCP_SERVER_NAME]) {
    throw new Error("Claude project .mcp.json was not written.");
  }

  const geminiWrite = await writeClientConfig({
    clientId: "gemini",
    scope: "global",
    projectPath,
    homeDir,
    serverPath
  });
  const geminiConfig = JSON.parse(await fs.readFile(geminiWrite.configPath, "utf8"));
  if (!geminiConfig.mcpServers[MCP_SERVER_NAME]) {
    throw new Error("Gemini global settings were not written.");
  }

  const kiloWrite = await writeClientConfig({
    clientId: "kilo-code",
    scope: "project",
    projectPath,
    homeDir,
    serverPath
  });
  if (!kiloWrite.configPath.endsWith(path.join(".kilo", "kilo.jsonc"))) {
    throw new Error("Kilo Code project config should use .kilo/kilo.jsonc.");
  }

  const clineWrite = await writeClientConfig({
    clientId: "cline",
    scope: "global",
    projectPath,
    homeDir,
    serverPath
  });
  if (!clineWrite.configPath.endsWith(path.join(".cline", "data", "settings", "cline_mcp_settings.json"))) {
    throw new Error("Cline global config path is wrong.");
  }

  console.log("Multi-client MCP configuration fragments and safe writes are supported.");
} finally {
  await fs.rm(projectPath, { recursive: true, force: true });
  await fs.rm(homeDir, { recursive: true, force: true });
}
