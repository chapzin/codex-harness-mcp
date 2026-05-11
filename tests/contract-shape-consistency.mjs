import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  createContract,
  ensureHarness,
  listHarness
} from "../assets/codex-harness-mcp/src/core.mjs";
import { listHarnessResources, readHarnessResource } from "../assets/codex-harness-mcp/src/mcp-features.mjs";

// R7-3 (refuted): the two MCP surfaces that expose contracts to clients
// (harness_list and harness://contracts) must use the same sanitized shape.
// listContracts is an internal helper and is allowed to return raw objects
// because it is consumed by these wrappers, not by clients directly.
const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "shape-"));
try {
  await ensureHarness({ project_path: projectPath });
  await createContract({
    project_path: projectPath,
    title: "Shape pin",
    goal: "Pin contract surface shape",
    completion_conditions: ["done"]
  });

  // 1. harness_list (tool)
  const tooled = await listHarness({ project_path: projectPath });
  assert.equal(tooled.contracts.length, 1);
  const fromTool = tooled.contracts[0];
  assert.ok(typeof fromTool.id === "string");
  assert.ok(typeof fromTool.title === "string" && fromTool.title.includes("<untrusted-data"),
    "tool surface wraps title in untrusted-data");
  assert.ok(typeof fromTool.status === "string");

  // 2. resources/read harness://contracts
  const readResource = await readHarnessResource("harness://contracts", { project_path: projectPath });
  const parsed = JSON.parse(readResource.contents[0].text);
  assert.equal(parsed.contracts.length, 1);
  const fromResource = parsed.contracts[0];
  assert.deepEqual(
    Object.keys(fromResource).sort(),
    Object.keys(fromTool).sort(),
    "tool and resource surfaces expose the same contract keys"
  );
  assert.ok(fromResource.title.includes("<untrusted-data"),
    "resource surface also wraps title in untrusted-data");

  // 3. listHarnessResources contract entries carry contract metadata, not raw fields
  const resources = await listHarnessResources({ project_path: projectPath, page_size: 100 });
  const contractResource = resources.resources.find((r) => r.uri.startsWith("harness://contract/"));
  assert.ok(contractResource, "individual contract listed as resource");
  // The dynamic resource entry exposes URI/title/description, NOT the raw goal/permissions/etc.
  assert.equal(typeof contractResource.uri, "string");
  assert.equal(typeof contractResource.title, "string");
  assert.equal(contractResource.mimeType, "text/markdown");
  assert.equal(contractResource.goal, undefined, "resource entry must not leak contract.goal");

  console.log("R7-3 PASS (refuted): exposed contract surfaces share a sanitized shape");
} finally {
  await fs.rm(projectPath, { recursive: true, force: true });
}
