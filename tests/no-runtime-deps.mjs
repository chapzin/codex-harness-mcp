import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetRoot = path.join(repoRoot, "assets", "codex-harness-mcp");

const files = {
  packageJson: path.join(assetRoot, "package.json"),
  packageLock: path.join(assetRoot, "package-lock.json"),
  server: path.join(assetRoot, "src", "server.mjs"),
  installer: path.join(repoRoot, "scripts", "install-codex-harness-mcp.mjs"),
  skill: path.join(repoRoot, "SKILL.md"),
  readme: path.join(repoRoot, "README.md")
};

const failures = [];

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function fail(message) {
  failures.push(message);
}

const packageJson = JSON.parse(await fs.readFile(files.packageJson, "utf8"));
if (packageJson.dependencies && Object.keys(packageJson.dependencies).length > 0) {
  fail("assets/codex-harness-mcp/package.json must not declare runtime dependencies.");
}

if (packageJson.devDependencies && Object.keys(packageJson.devDependencies).length > 0) {
  fail("assets/codex-harness-mcp/package.json must not declare dev dependencies.");
}

if (await exists(files.packageLock)) {
  fail("assets/codex-harness-mcp/package-lock.json must not be bundled because it embeds registry URLs.");
}

const combined = await Promise.all(
  Object.values(files)
    .filter((filePath) => filePath !== files.packageLock)
    .map((filePath) => fs.readFile(filePath, "utf8"))
);
const allText = combined.join("\n");

const forbiddenPatterns = [
  new RegExp(["npm", "install"].join("\\s+"), "i"),
  new RegExp(["registry", "npmjs", "org"].join("\\."), "i"),
  new RegExp(`@${["modelcontextprotocol", "sdk"].join("\\/")}`, "i"),
  new RegExp(`\\b${["z", "od"].join("")}\\b`, "i"),
  new RegExp("https?:\\/\\/", "i")
];

for (const pattern of forbiddenPatterns) {
  if (pattern.test(allText)) {
    fail(`Forbidden runtime dependency marker found: ${pattern}`);
  }
}

const serverText = await fs.readFile(files.server, "utf8");
const externalImports = [...serverText.matchAll(/^\s*import\s+.*?\s+from\s+["']([^"']+)["']/gm)]
  .map((match) => match[1])
  .filter((specifier) => !specifier.startsWith("node:") && !specifier.startsWith("./") && !specifier.startsWith("../"));
if (externalImports.length > 0) {
  fail(`Server has external imports: ${externalImports.join(", ")}`);
}

if (failures.length > 0) {
  console.error(failures.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log("No unverifiable runtime dependency markers found.");
