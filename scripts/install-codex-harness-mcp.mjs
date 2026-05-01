#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(__dirname, "..");
const source = path.join(skillRoot, "assets", "codex-harness-mcp");
const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
const target = path.join(codexHome, "mcp-servers", "codex-harness-mcp");
const serverPath = path.join(target, "src", "server.mjs");

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function spawnCommand(command, args, options) {
  if (process.platform !== "win32") {
    return spawnSync(command, args, options);
  }

  const script = `& ${psQuote(command)} ${args.map(psQuote).join(" ")}`;
  return spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], options);
}

function run(command, args, options = {}) {
  const result = spawnCommand(command, args, {
    stdio: "inherit",
    ...options
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

function tryRun(command, args, options = {}) {
  const result = spawnCommand(command, args, {
    stdio: "pipe",
    encoding: "utf8",
    ...options
  });

  return {
    ok: !result.error && result.status === 0,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    status: result.status
  };
}

async function copyServer() {
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.rm(target, { recursive: true, force: true });
  await fs.cp(source, target, {
    recursive: true,
    filter: (entry) => !entry.includes(`${path.sep}node_modules${path.sep}`)
  });
}

async function main() {
  const nodeCheck = tryRun("node", ["--version"]);
  if (!nodeCheck.ok) {
    throw new Error("Node.js 20+ is required, but node was not found in PATH.");
  }

  const codexCheck = tryRun("codex", ["--version"]);
  if (!codexCheck.ok) {
    throw new Error("Codex CLI is required, but codex was not found in PATH.");
  }

  console.log(`Installing Codex Harness MCP to ${target}`);
  await copyServer();

  const list = tryRun("codex", ["mcp", "list"]);
  if (list.stdout.includes("codex-harness")) {
    console.log("Removing existing codex-harness MCP registration...");
    run("codex", ["mcp", "remove", "codex-harness"]);
  }

  console.log("Registering codex-harness with Codex CLI...");
  run("codex", ["mcp", "add", "codex-harness", "--", "node", serverPath]);

  console.log("\nDone. Verify with:");
  console.log("  codex mcp list");
  console.log("\nUse in Codex:");
  console.log("  Use codex-harness. Create a contract, record traces, and run the eval gate before completion.");
}

main().catch((error) => {
  console.error(`\nInstall failed: ${error.message}`);
  process.exit(1);
});
