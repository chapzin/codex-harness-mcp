import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const installerPath = path.join(repoRoot, "scripts", "install-codex-harness-mcp.mjs");
const installerText = await fs.readFile(installerPath, "utf8");

const forbiddenNeedles = [
  ["node:", "child", "_", "process"].join(""),
  ["spawn", "Sync"].join(""),
  ["exec", "Sync"].join(""),
  ["exec", "File", "Sync"].join(""),
  ["power", "shell", ".", "exe"].join(""),
  ["Execution", "Policy"].join(""),
  ["By", "pass"].join("")
];

const failures = forbiddenNeedles.filter((needle) => installerText.includes(needle));

if (failures.length > 0) {
  console.error(failures.map((needle) => `- Installer must not contain command execution marker: ${needle}`).join("\n"));
  process.exit(1);
}

console.log("Installer has no command execution markers.");
