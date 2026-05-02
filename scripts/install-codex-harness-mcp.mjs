#!/usr/bin/env node
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveClientIds,
  supportedClientIds,
  writeClientConfig
} from "./lib/mcp-client-configs.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(__dirname, "..");
const source = path.join(skillRoot, "assets", "codex-harness-mcp");
const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
const target = path.join(codexHome, "mcp-servers", "codex-harness-mcp");
const serverPath = path.join(target, "src", "server.mjs");
const configPath = path.join(codexHome, "config.toml");
const sectionName = "mcp_servers.codex-harness";
const defaultClients = ["codex"];

function nodeMajorVersion() {
  const major = Number.parseInt(process.versions.node.split(".")[0], 10);
  return Number.isFinite(major) ? major : 0;
}

async function copyServer() {
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.rm(target, { recursive: true, force: true });
  await fs.cp(source, target, {
    recursive: true,
    filter: (entry) => !entry.includes(`${path.sep}node_modules${path.sep}`)
  });
}

async function upsertCodexConfig() {
  await fs.mkdir(codexHome, { recursive: true });
  let existing = "";
  try {
    existing = await fs.readFile(configPath, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  const replacement = [
    `[${sectionName}]`,
    `command = ${tomlString("node")}`,
    `args = [${tomlString(serverPath)}]`,
    ""
  ].join("\n");
  const updated = replaceTomlSection(existing, sectionName, replacement);
  await fs.writeFile(configPath, updated, "utf8");
}

async function writeAdditionalClientConfigs({ clients, scope, projectPath }) {
  const results = [];
  for (const clientId of clients) {
    const result = await writeClientConfig({
      clientId,
      scope,
      projectPath,
      homeDir: os.homedir(),
      serverPath
    });
    results.push(result);
  }
  return results;
}

function replaceTomlSection(sourceText, targetSection, replacement) {
  const lines = sourceText.split(/\r?\n/);
  const header = `[${targetSection}]`;
  const start = lines.findIndex((line) => line.trim() === header);

  if (start === -1) {
    const prefix = sourceText.trimEnd();
    return `${prefix}${prefix ? "\n\n" : ""}${replacement}`;
  }

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^\s*\[[^\]]+\]\s*$/.test(lines[index])) {
      end = index;
      break;
    }
  }

  const before = lines.slice(0, start).join("\n").trimEnd();
  const after = lines.slice(end).join("\n").trimStart();
  return [before, replacement.trimEnd(), after].filter(Boolean).join("\n\n") + "\n";
}

function tomlString(value) {
  return JSON.stringify(String(value));
}

function parseArgs(argv) {
  const options = {
    clients: [],
    scope: "auto",
    projectPath: process.cwd(),
    listClients: false,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--list-clients") {
      options.listClients = true;
      continue;
    }
    if (arg === "--client" || arg === "--clients") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(`${arg} requires a value.`);
      }
      options.clients.push(value);
      index += 1;
      continue;
    }
    if (arg.startsWith("--clients=")) {
      options.clients.push(arg.slice("--clients=".length));
      continue;
    }
    if (arg.startsWith("--client=")) {
      options.clients.push(arg.slice("--client=".length));
      continue;
    }
    if (arg === "--scope") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--scope requires a value.");
      }
      options.scope = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--scope=")) {
      options.scope = arg.slice("--scope=".length);
      continue;
    }
    if (arg === "--project") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--project requires a value.");
      }
      options.projectPath = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--project=")) {
      options.projectPath = arg.slice("--project=".length);
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

function resolveInstallClients(values) {
  const requested = values.length > 0 ? values : defaultClients;
  const normalized = requested
    .flatMap((value) => String(value).split(","))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const wantsAll = normalized.includes("all");
  const clients = [];

  if (wantsAll || normalized.includes("codex")) {
    clients.push("codex");
  }

  const jsonClientValues = wantsAll
    ? ["all"]
    : normalized.filter((value) => value !== "codex");
  for (const clientId of resolveClientIds(jsonClientValues)) {
    if (!clients.includes(clientId)) {
      clients.push(clientId);
    }
  }

  return clients;
}

function printHelp() {
  console.log("Install Codex Harness MCP and optionally write MCP configs for other clients.");
  console.log("");
  console.log("Usage:");
  console.log("  node scripts/install-codex-harness-mcp.mjs");
  console.log("  node scripts/install-codex-harness-mcp.mjs --clients codex,claude-code,opencode");
  console.log("  node scripts/install-codex-harness-mcp.mjs --clients all --scope auto --project .");
  console.log("");
  console.log("Options:");
  console.log("  --clients <list>   Comma-separated clients. Default: codex. Use all for every supported JSON client plus Codex.");
  console.log("  --scope <scope>    auto, project, or global for JSON clients. Default: auto.");
  console.log("  --project <path>   Project root for project-scoped configs. Default: current directory.");
  console.log("  --list-clients     Print supported clients.");
  console.log("");
  console.log("Supported non-Codex clients:");
  console.log(`  ${supportedClientIds().join(", ")}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  if (options.listClients) {
    console.log(["codex", ...supportedClientIds()].join("\n"));
    return;
  }

  if (nodeMajorVersion() < 20) {
    throw new Error("Node.js 20+ is required.");
  }

  const clients = resolveInstallClients(options.clients);
  console.log(`Installing Codex Harness MCP to ${target}`);
  await copyServer();

  if (clients.includes("codex")) {
    console.log(`Writing Codex MCP configuration to ${configPath}`);
    await upsertCodexConfig();
  }

  const jsonClients = clients.filter((clientId) => clientId !== "codex");
  if (jsonClients.length > 0) {
    console.log(`Writing ${jsonClients.length} additional MCP client configuration(s) with ${options.scope} scope`);
    const written = await writeAdditionalClientConfigs({
      clients: jsonClients,
      scope: options.scope,
      projectPath: path.resolve(options.projectPath)
    });
    for (const result of written) {
      console.log(`  ${result.clientId}: ${result.configPath}`);
    }
  }

  console.log("\nDone. Verify with:");
  if (clients.includes("codex")) {
    console.log("  codex mcp list");
  }
  if (jsonClients.length > 0) {
    console.log("  Restart or reload the configured client, then inspect its MCP/server tools panel.");
  }
  console.log("\nUse in Codex:");
  console.log("  Use codex-harness. Create a contract, record traces, and run the eval gate before completion.");
}

main().catch((error) => {
  console.error(`\nInstall failed: ${error.message}`);
  process.exit(1);
});
