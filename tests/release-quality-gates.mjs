import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetRoot = path.join(repoRoot, "assets", "codex-harness-mcp");

const packageJson = JSON.parse(await fs.readFile(path.join(assetRoot, "package.json"), "utf8"));
const serverSource = await fs.readFile(path.join(assetRoot, "src", "server.mjs"), "utf8");
const readme = await fs.readFile(path.join(repoRoot, "README.md"), "utf8");
const skill = await fs.readFile(path.join(repoRoot, "SKILL.md"), "utf8");

const serverVersion = serverSource.match(/version:\s*"([^"]+)"/)?.[1];
assert.equal(serverVersion, packageJson.version, "Server version must match assets package version.");

for (const marker of [
  "harness_write_governance_policy",
  "harness_audit_governance",
  "harness_export_governance_report",
  "harness://governance/report",
  "PASS/FLAG/BLOCK"
]) {
  assert.match(readme, new RegExp(escapeRegExp(marker)), `README must document ${marker}.`);
  assert.match(skill, new RegExp(escapeRegExp(marker)), `SKILL must document ${marker}.`);
}

console.log("Release documentation and version quality gates passed.");

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
