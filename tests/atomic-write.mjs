import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { writeJson, readJson, harnessPath, ensureHarness } from "../assets/codex-harness-mcp/src/core.mjs";

// 1. writeJson succeeds and produces valid JSON (no tmp leftover on success).
{
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "atomic-ok-"));
  try {
    await ensureHarness({ project_path: projectPath });
    const target = harnessPath(projectPath, "atomic-probe.json");
    await writeJson(target, { hello: "world" });
    const read = await readJson(target, null);
    assert.deepEqual(read, { hello: "world" }, "atomic write produces readable JSON");

    const dirContents = await fs.readdir(path.dirname(target));
    const tmps = dirContents.filter((f) => f.startsWith("atomic-probe.json.tmp."));
    assert.equal(tmps.length, 0, "no temp file left behind on success");
    console.log("atomic-write: success path produces readable JSON, no tmp leftover");
  } finally {
    await fs.rm(projectPath, { recursive: true, force: true });
  }
}

// 2. Concurrent writers never expose a half-written file: every read returns
//    either the previous full value or the new full value, never invalid JSON.
{
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "atomic-race-"));
  try {
    await ensureHarness({ project_path: projectPath });
    const target = harnessPath(projectPath, "concurrent-probe.json");
    await writeJson(target, { tag: "initial" });

    const N = 30;
    const writers = [];
    for (let i = 0; i < N; i++) {
      writers.push(writeJson(target, { tag: `write-${i}`, payload: "x".repeat(2000) }));
    }
    const readers = [];
    for (let i = 0; i < 60; i++) {
      readers.push((async () => {
        try {
          const raw = await fs.readFile(target, "utf8");
          JSON.parse(raw); // must always parse
          return true;
        } catch (e) {
          return e.message;
        }
      })());
    }

    await Promise.all(writers);
    const readResults = await Promise.all(readers);
    const errors = readResults.filter((r) => r !== true);
    assert.deepEqual(errors, [], `no torn reads expected, got: ${JSON.stringify(errors).slice(0, 200)}`);
    console.log(`atomic-write: 30 concurrent writers + 60 concurrent reads, zero torn reads`);
  } finally {
    await fs.rm(projectPath, { recursive: true, force: true });
  }
}

// 3. Failure mid-write does not corrupt the existing file.
//    Force JSON.stringify to throw via a circular ref.
{
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "atomic-fail-"));
  try {
    await ensureHarness({ project_path: projectPath });
    const target = harnessPath(projectPath, "preserve-probe.json");
    await writeJson(target, { preserved: true });

    const circular = {};
    circular.self = circular;
    await assert.rejects(writeJson(target, circular), /circular|Converting/i);

    // Original file must still parse to original content
    const read = await readJson(target, null);
    assert.deepEqual(read, { preserved: true }, "original file is preserved on failed write");

    const dirContents = await fs.readdir(path.dirname(target));
    const tmps = dirContents.filter((f) => f.startsWith("preserve-probe.json.tmp."));
    assert.equal(tmps.length, 0, "no tmp file leaked on failure");
    console.log("atomic-write: failure does not corrupt existing file or leak tmp");
  } finally {
    await fs.rm(projectPath, { recursive: true, force: true });
  }
}

console.log("Atomic writeJson: all checks passed.");
