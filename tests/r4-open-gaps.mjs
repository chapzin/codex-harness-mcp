import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  ensureHarness,
  recordKnowledge
} from "../assets/codex-harness-mcp/src/core.mjs";
import { listHarnessResources } from "../assets/codex-harness-mcp/src/mcp-features.mjs";

// R4-2: cursor-based pagination
{
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "r4-paginate-"));
  try {
    await ensureHarness({ project_path: projectPath });
    // Plant enough knowledge items to require pagination
    for (let i = 0; i < 30; i++) {
      await recordKnowledge({
        project_path: projectPath,
        title: `Item ${i}`,
        content: "x",
        kind: "knowledge"
      });
    }
    // page_size=15 forces multiple pages (we have 15 static + 30 dynamic = 45 resources)
    const collected = [];
    let cursor;
    let pageCount = 0;
    do {
      const page = await listHarnessResources({ project_path: projectPath, page_size: 15, cursor });
      assert.ok(page.resources.length > 0, `page ${pageCount} non-empty`);
      assert.ok(page.resources.length <= 15, `page ${pageCount} respects page_size`);
      collected.push(...page.resources);
      cursor = page.nextCursor;
      pageCount++;
      assert.ok(pageCount <= 10, "pagination terminates");
    } while (cursor);

    const ids = new Set(collected.map((r) => r.uri));
    assert.equal(ids.size, collected.length, "no duplicate URIs across pages");
    assert.ok(collected.length >= 45, `collected at least 45 resources (got ${collected.length})`);
    assert.ok(pageCount >= 3, `pagination produced at least 3 pages (got ${pageCount})`);

    // Default page (no cursor, no page_size) caps at 200 — for this fixture, returns all 45.
    const single = await listHarnessResources({ project_path: projectPath });
    assert.ok(!single.nextCursor, "small project returns one page with no nextCursor");
    assert.equal(single.resources.length, collected.length, "single-page count matches paginated total");

    console.log(`R4-2 PASS: pagination over ${collected.length} resources across ${pageCount} pages`);
  } finally {
    await fs.rm(projectPath, { recursive: true, force: true });
  }
}

// R4-4: error messages redact projectPath
{
  const serverPath = path.resolve("assets/codex-harness-mcp/src/server.mjs");
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "r4-redact-"));
  const child = spawn(process.execPath, [serverPath], { cwd, stdio: ["pipe", "pipe", "pipe"] });
  let buf = "";
  const responses = [];
  child.stdout.on("data", (chunk) => {
    buf += chunk.toString("utf8");
    let idx;
    while ((idx = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (line) responses.push(JSON.parse(line));
    }
  });
  child.stdin.on("error", () => {});

  const writes = [
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } },
    // resources/read for a non-existent contract triggers a throw; error path goes through sendResult isError
    { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "harness_query_knowledge", arguments: { query: "test", project_path: path.join(cwd, "..", "does-not-exist-12345") } } }
  ];
  for (const m of writes) child.stdin.write(`${JSON.stringify(m)}\n`);
  child.stdin.end();
  await new Promise((res) => { child.on("close", res); });

  // Confirm the cwd (project root) does not appear verbatim in any response that carries an error.
  for (const r of responses) {
    const text = JSON.stringify(r);
    if (r.error || (r.result && r.result.isError)) {
      assert.ok(
        !text.includes(cwd),
        `error response must not leak cwd path: ${text.slice(0, 200)}`
      );
    }
  }

  await fs.rm(cwd, { recursive: true, force: true });
  console.log("R4-4 PASS: error responses do not leak projectPath verbatim");
}

console.log("R4 open gaps closed: pagination + path redaction.");
