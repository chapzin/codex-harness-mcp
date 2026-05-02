import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverPath = path.join(repoRoot, "assets", "codex-harness-mcp", "src", "server.mjs");
const serverText = await fs.readFile(serverPath, "utf8");

const toolNames = [...serverText.matchAll(/name:\s+"(harness_[^"]+)"/g)].map((match) => match[1]);
const outputSchemaCount = [...serverText.matchAll(/\boutputSchema\s*:/g)].length;

if (toolNames.length < 15) {
  throw new Error(`Expected at least 15 harness tools after adding persistent knowledge, found ${toolNames.length}.`);
}

if (outputSchemaCount < toolNames.length) {
  throw new Error(`Every harness tool should advertise outputSchema. Tools=${toolNames.length}, schemas=${outputSchemaCount}.`);
}

for (const marker of [
  "structuredContent",
  "resources/list",
  "resources/read",
  "prompts/list",
  "prompts/get",
  "pendingMessages",
  "harness_migrate",
  "harness_record_verification",
  "harness_record_research",
  "harness_record_lesson",
  "harness_record_knowledge",
  "harness_query_knowledge",
  "harness_rebuild_knowledge_index",
  "harness_record_eval_case",
  "harness_record_eval_run",
  "harness_compare_eval_runs",
  "harness_record_harness_profile",
  "harness_list_harness_profiles"
]) {
  if (!serverText.includes(marker)) {
    throw new Error(`Server is missing MCP protocol marker: ${marker}`);
  }
}

console.log("MCP tools advertise structured output and protocol capabilities.");
