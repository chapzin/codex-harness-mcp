import { promises as fs } from "node:fs";
import path from "node:path";

export const MCP_SERVER_NAME = "codex-harness";
export const VSCODE_SERVER_NAME = "codexHarness";

const JSON_CLIENTS = [
  "claude-code",
  "opencode",
  "kilo",
  "gemini",
  "cursor",
  "vscode",
  "cline",
  "windsurf",
  "roo"
];

export const CLIENT_ALIASES = new Map([
  ["claude", "claude-code"],
  ["claude-code", "claude-code"],
  ["claude_code", "claude-code"],
  ["opencode", "opencode"],
  ["open-code", "opencode"],
  ["kilo", "kilo"],
  ["kilo-cli", "kilo"],
  ["kilo-code", "kilo"],
  ["kilocode", "kilo"],
  ["gemini", "gemini"],
  ["gemini-cli", "gemini"],
  ["cursor", "cursor"],
  ["vscode", "vscode"],
  ["vs-code", "vscode"],
  ["copilot", "vscode"],
  ["github-copilot", "vscode"],
  ["cline", "cline"],
  ["windsurf", "windsurf"],
  ["cascade", "windsurf"],
  ["roo", "roo"],
  ["roo-code", "roo"],
  ["roocode", "roo"]
]);

export function supportedClientIds() {
  return JSON_CLIENTS.slice();
}

export function resolveClientIds(values = []) {
  const requested = values
    .flatMap((value) => String(value || "").split(","))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (requested.length === 0) {
    return [];
  }

  const resolved = [];
  for (const value of requested) {
    if (value === "all") {
      for (const clientId of JSON_CLIENTS) {
        pushUnique(resolved, clientId);
      }
      continue;
    }

    const clientId = CLIENT_ALIASES.get(value);
    if (!clientId) {
      throw new Error(`Unknown MCP client: ${value}`);
    }
    pushUnique(resolved, clientId);
  }
  return resolved;
}

export function createClientConfigFragment(clientId, options = {}) {
  const canonical = canonicalClientId(clientId);
  const serverPath = requireServerPath(options.serverPath);
  const mcpServersEntry = {
    command: "node",
    args: [serverPath]
  };

  switch (canonical) {
    case "claude-code":
      return {
        clientId: canonical,
        config: {
          mcpServers: {
            [MCP_SERVER_NAME]: {
              type: "stdio",
              ...mcpServersEntry
            }
          }
        }
      };

    case "cursor":
    case "cline":
    case "windsurf":
    case "roo":
      return {
        clientId: canonical,
        config: {
          mcpServers: {
            [MCP_SERVER_NAME]: mcpServersEntry
          }
        }
      };

    case "opencode":
    case "kilo":
      return {
        clientId: canonical,
        config: {
          mcp: {
            [MCP_SERVER_NAME]: {
              type: "local",
              command: ["node", serverPath],
              enabled: true
            }
          }
        }
      };

    case "gemini":
      return {
        clientId: canonical,
        config: {
          mcpServers: {
            [MCP_SERVER_NAME]: {
              command: "node",
              args: [serverPath],
              timeout: 30000,
              trust: false
            }
          }
        }
      };

    case "vscode":
      return {
        clientId: canonical,
        config: {
          servers: {
            [VSCODE_SERVER_NAME]: {
              type: "stdio",
              command: "node",
              args: [serverPath]
            }
          }
        }
      };

    default:
      throw new Error(`Unsupported MCP client: ${canonical}`);
  }
}

export async function writeClientConfig(options = {}) {
  const clientId = canonicalClientId(options.clientId);
  const scope = normalizeScope(options.scope);
  const projectPath = path.resolve(options.projectPath || process.cwd());
  const homeDir = path.resolve(options.homeDir || process.env.HOME || process.env.USERPROFILE || "");
  const serverPath = requireServerPath(options.serverPath);
  const configPath = resolveConfigPath({ clientId, scope, projectPath, homeDir });
  const fragment = createClientConfigFragment(clientId, { serverPath });
  const existing = await readJsonObject(configPath);
  const updated = deepMerge(existing, fragment.config);

  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, `${JSON.stringify(updated, null, 2)}\n`, "utf8");

  return {
    clientId,
    scope,
    configPath,
    config: updated
  };
}

export function resolveConfigPath({ clientId, scope = "auto", projectPath, homeDir }) {
  const canonical = canonicalClientId(clientId);
  const selectedScope = normalizeScope(scope);
  const projectRoot = path.resolve(projectPath || process.cwd());
  const userHome = path.resolve(homeDir || process.env.HOME || process.env.USERPROFILE || "");

  if (selectedScope === "project") {
    return projectConfigPath(canonical, projectRoot);
  }

  if (selectedScope === "global") {
    return globalConfigPath(canonical, userHome);
  }

  return projectPreferredClients().has(canonical)
    ? projectConfigPath(canonical, projectRoot)
    : globalConfigPath(canonical, userHome);
}

export function mergeClientConfig(existing, fragment) {
  return deepMerge(existing || {}, fragment || {});
}

function projectConfigPath(clientId, projectRoot) {
  switch (clientId) {
    case "claude-code":
      return path.join(projectRoot, ".mcp.json");
    case "opencode":
      return path.join(projectRoot, "opencode.json");
    case "kilo":
      return path.join(projectRoot, ".kilo", "kilo.jsonc");
    case "gemini":
      return path.join(projectRoot, ".gemini", "settings.json");
    case "cursor":
      return path.join(projectRoot, ".cursor", "mcp.json");
    case "vscode":
      return path.join(projectRoot, ".vscode", "mcp.json");
    case "roo":
      return path.join(projectRoot, ".roo", "mcp.json");
    case "cline":
      throw new Error("Cline does not have a stable project MCP config path; use --scope global.");
    case "windsurf":
      throw new Error("Windsurf Cascade MCP config is global; use --scope global.");
    default:
      throw new Error(`Unsupported project client: ${clientId}`);
  }
}

function globalConfigPath(clientId, homeDir) {
  if (!homeDir) {
    throw new Error("Home directory is required for global client config.");
  }

  switch (clientId) {
    case "opencode":
      return path.join(homeDir, ".config", "opencode", "opencode.json");
    case "kilo":
      return path.join(homeDir, ".config", "kilo", "kilo.jsonc");
    case "gemini":
      return path.join(homeDir, ".gemini", "settings.json");
    case "cursor":
      return path.join(homeDir, ".cursor", "mcp.json");
    case "cline":
      return path.join(homeDir, ".cline", "data", "settings", "cline_mcp_settings.json");
    case "windsurf":
      return path.join(homeDir, ".codeium", "windsurf", "mcp_config.json");
    case "claude-code":
      throw new Error("Use `claude mcp add` for user/global scope; this installer writes Claude Code project `.mcp.json` only.");
    case "vscode":
      throw new Error("VS Code user-profile config path varies by profile; use --scope project.");
    case "roo":
      throw new Error("Roo Code global config path varies; use --scope project.");
    default:
      throw new Error(`Unsupported global client: ${clientId}`);
  }
}

function projectPreferredClients() {
  return new Set(["claude-code", "opencode", "kilo", "gemini", "cursor", "vscode", "roo"]);
}

function canonicalClientId(value) {
  const clientId = CLIENT_ALIASES.get(String(value || "").toLowerCase());
  if (!clientId) {
    throw new Error(`Unknown MCP client: ${value || "(missing)"}`);
  }
  return clientId;
}

function normalizeScope(value) {
  const scope = String(value || "auto").toLowerCase();
  if (!["auto", "project", "global"].includes(scope)) {
    throw new Error(`Unsupported config scope: ${value}`);
  }
  return scope;
}

function requireServerPath(serverPath) {
  if (!serverPath) {
    throw new Error("serverPath is required.");
  }
  return path.resolve(serverPath);
}

async function readJsonObject(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    if (!raw.trim()) {
      return {};
    }
    const parsed = JSON.parse(raw);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      throw new Error("config root must be a JSON object");
    }
    return parsed;
  } catch (error) {
    if (error.code === "ENOENT") {
      return {};
    }
    throw new Error(`Cannot read JSON config ${filePath}: ${error.message}`);
  }
}

function deepMerge(base, patch) {
  const output = { ...(base || {}) };
  for (const [key, value] of Object.entries(patch || {})) {
    if (isPlainObject(value) && isPlainObject(output[key])) {
      output[key] = deepMerge(output[key], value);
    } else {
      output[key] = value;
    }
  }
  return output;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pushUnique(values, value) {
  if (!values.includes(value)) {
    values.push(value);
  }
}
