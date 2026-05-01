#!/usr/bin/env node
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
const configPath = path.join(codexHome, "config.toml");
const sectionName = "mcp_servers.codex-harness";

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

async function main() {
  if (nodeMajorVersion() < 20) {
    throw new Error("Node.js 20+ is required.");
  }

  console.log(`Installing Codex Harness MCP to ${target}`);
  await copyServer();

  console.log(`Writing Codex MCP configuration to ${configPath}`);
  await upsertCodexConfig();

  console.log("\nDone. Verify with:");
  console.log("  codex mcp list");
  console.log("\nUse in Codex:");
  console.log("  Use codex-harness. Create a contract, record traces, and run the eval gate before completion.");
}

main().catch((error) => {
  console.error(`\nInstall failed: ${error.message}`);
  process.exit(1);
});
