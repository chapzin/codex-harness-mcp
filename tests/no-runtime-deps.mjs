import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetRoot = path.join(repoRoot, "assets", "codex-harness-mcp");

const files = {
  packageJson: path.join(assetRoot, "package.json"),
  packageLock: path.join(assetRoot, "package-lock.json"),
  serverSrc: path.join(assetRoot, "src"),
  installer: path.join(repoRoot, "scripts", "install-codex-harness-mcp.mjs"),
  installerLib: path.join(repoRoot, "scripts", "lib"),
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
  [
    ...(await listServerSourceFiles(files.serverSrc)),
    files.installer,
    ...(await listServerSourceFiles(files.installerLib))
  ]
    .map((filePath) => fs.readFile(filePath, "utf8"))
);
const runtimeText = combined.join("\n");
const docText = [
  await fs.readFile(files.skill, "utf8"),
  await fs.readFile(files.readme, "utf8")
].join("\n");

const forbiddenPatterns = [
  new RegExp(["npm", "install"].join("\\s+"), "i"),
  new RegExp(["registry", "npmjs", "org"].join("\\."), "i"),
  new RegExp(`@${["modelcontextprotocol", "sdk"].join("\\/")}`, "i"),
  new RegExp(`\\b${["z", "od"].join("")}\\b`, "i")
];

for (const pattern of forbiddenPatterns) {
  if (pattern.test(`${runtimeText}\n${docText}`)) {
    fail(`Forbidden runtime dependency marker found: ${pattern}`);
  }
}

if (/https?:\/\//i.test(runtimeText)) {
  fail("Runtime or installer files must not contain external URLs.");
}

const docUrls = [...docText.matchAll(/https?:\/\/[^\s)]+/gi)].map((match) => match[0]);
const allowedDocUrls = new Set([
  "https://skills.sh/chapzin/codex-harness-mcp/codex-harness-mcp"
]);
const unexpectedDocUrls = docUrls.filter((url) => !allowedDocUrls.has(url));
if (unexpectedDocUrls.length > 0) {
  fail(`Unexpected external documentation URLs in README/SKILL: ${unexpectedDocUrls.join(", ")}`);
}

const sourceTexts = await Promise.all(
  [
    ...(await listServerSourceFiles(files.serverSrc)),
    files.installer,
    ...(await listServerSourceFiles(files.installerLib))
  ].map(async (filePath) => ({
    filePath,
    text: await fs.readFile(filePath, "utf8")
  }))
);
const externalImports = sourceTexts.flatMap(({ filePath, text }) =>
  [...text.matchAll(/^\s*import\s+.*?\s+from\s+["']([^"']+)["']/gm)]
    .map((match) => ({ filePath, specifier: match[1] }))
    .filter(({ specifier }) => !specifier.startsWith("node:") && !specifier.startsWith("./") && !specifier.startsWith("../"))
);
if (externalImports.length > 0) {
  fail(`Runtime or installer has external imports: ${externalImports.map((item) => `${path.basename(item.filePath)}:${item.specifier}`).join(", ")}`);
}

if (failures.length > 0) {
  console.error(failures.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log("No unverifiable runtime dependency markers found.");

async function listServerSourceFiles(srcRoot) {
  const names = await fs.readdir(srcRoot);
  return names
    .filter((name) => name.endsWith(".mjs"))
    .map((name) => path.join(srcRoot, name))
    .sort();
}
