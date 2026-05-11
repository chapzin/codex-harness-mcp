import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  ensureHarness,
  harnessPath,
  mutateState
} from "../assets/codex-harness-mcp/src/core.mjs";

// R9-H3: two simultaneous mutateState callers (simulating two server processes
// sharing the same project) must not silently lose state. With the cross-process
// file lock in place, both updates must commit; neither can overwrite the other.
{
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "r9-h3-"));
  try {
    await ensureHarness({ project_path: projectPath });

    const aDone = mutateState(projectPath, async (state) => {
      // Tiny await to force interleave with B.
      await new Promise((r) => setTimeout(r, 25));
      state.events.push({ ts: new Date().toISOString(), type: "decision", summary: "A wrote first" });
      state.counters.decisions = (state.counters.decisions || 0) + 1;
    });
    const bDone = mutateState(projectPath, async (state) => {
      await new Promise((r) => setTimeout(r, 10));
      state.events.push({ ts: new Date().toISOString(), type: "decision", summary: "B wrote second" });
      state.counters.decisions = (state.counters.decisions || 0) + 1;
    });

    await Promise.all([aDone, bDone]);

    const stateFile = harnessPath(projectPath, "state.json");
    const raw = await fs.readFile(stateFile, "utf8");
    const final = JSON.parse(raw);

    const hasA = final.events.some((e) => e.summary === "A wrote first");
    const hasB = final.events.some((e) => e.summary === "B wrote second");
    assert.ok(hasA, "event A must be present after concurrent mutateState");
    assert.ok(hasB, "event B must be present after concurrent mutateState");
    assert.equal(final.counters.decisions, 2, `both decisions must count: got ${final.counters.decisions}`);

    // Lock file must not be left behind after the writes settle.
    const remnants = (await fs.readdir(harnessPath(projectPath))).filter((n) => n.endsWith(".lock"));
    assert.deepEqual(remnants, [], `no lock files should remain after writes settle, got ${remnants.join(",")}`);

    console.log("R9-H3 PASS: cross-process safe mutateState — both writes preserved, no leftover locks");
  } finally {
    await fs.rm(projectPath, { recursive: true, force: true });
  }
}

// R9-H4: orphan .tmp.PID.HEX files (left behind by SIGKILL between writeFile and
// rename) must be cleaned up by ensureHarness when older than the reaper window.
{
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "r9-h4-"));
  try {
    await ensureHarness({ project_path: projectPath });

    const stateFile = harnessPath(projectPath, "state.json");
    const orphanFresh = `${stateFile}.tmp.${process.pid}.cafef00d`;
    const orphanStale = `${stateFile}.tmp.${process.pid}.deadbeef`;
    await fs.writeFile(orphanFresh, "{}", "utf8");
    await fs.writeFile(orphanStale, "{}", "utf8");

    // Backdate the stale orphan 10 minutes (reaper threshold is 5 min).
    const tenMinAgo = (Date.now() - 10 * 60_000) / 1000;
    await fs.utimes(orphanStale, tenMinAgo, tenMinAgo);

    // Re-run ensureHarness — reaper must remove the stale one, keep the fresh one.
    await ensureHarness({ project_path: projectPath });

    const after = await fs.readdir(harnessPath(projectPath));
    assert.ok(after.includes(path.basename(orphanFresh)),
      "fresh tmp orphan (<5min old) must be preserved");
    assert.ok(!after.includes(path.basename(orphanStale)),
      "stale tmp orphan (>5min old) must be reaped");

    console.log("R9-H4 PASS: orphan tmp reaper removes >5min stale files, preserves fresh ones");
  } finally {
    await fs.rm(projectPath, { recursive: true, force: true });
  }
}

// R9-H4b: tmp orphan reaper walks subdirectories where writeJson writes
// (contracts/, knowledge/items/, evals/cases/, etc.), not just the root.
{
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "r9-h4b-"));
  try {
    await ensureHarness({ project_path: projectPath });

    const orphanInContracts = harnessPath(projectPath, "contracts",
      `c-9999.json.tmp.${process.pid}.beefbeef`);
    await fs.writeFile(orphanInContracts, "{}", "utf8");
    const tenMinAgo = (Date.now() - 10 * 60_000) / 1000;
    await fs.utimes(orphanInContracts, tenMinAgo, tenMinAgo);

    const orphanInKnowledge = harnessPath(projectPath, "knowledge", "items",
      `k.json.tmp.${process.pid}.beefface`);
    await fs.writeFile(orphanInKnowledge, "{}", "utf8");
    await fs.utimes(orphanInKnowledge, tenMinAgo, tenMinAgo);

    await ensureHarness({ project_path: projectPath });

    const contractsAfter = await fs.readdir(harnessPath(projectPath, "contracts"));
    const knowledgeItemsAfter = await fs.readdir(harnessPath(projectPath, "knowledge", "items"));

    assert.ok(!contractsAfter.includes(path.basename(orphanInContracts)),
      `stale tmp in contracts/ must be reaped, got ${contractsAfter.join(",")}`);
    assert.ok(!knowledgeItemsAfter.includes(path.basename(orphanInKnowledge)),
      `stale tmp in knowledge/items/ must be reaped, got ${knowledgeItemsAfter.join(",")}`);

    console.log("R9-H4b PASS: reaper descends into subdirectories");
  } finally {
    await fs.rm(projectPath, { recursive: true, force: true });
  }
}

// R9-H3 stale lock recovery: if a previous server died holding a lock, the next
// writer must reclaim the lock instead of hanging forever.
{
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "r9-stale-lock-"));
  try {
    await ensureHarness({ project_path: projectPath });

    // Plant a stale lock (mtime ~1 min ago, well past the 30s staleness window).
    const lockFile = harnessPath(projectPath, ".state.lock");
    await fs.writeFile(lockFile, "99999\n2026-01-01T00:00:00Z\n", "utf8");
    const aMinAgo = (Date.now() - 60_000) / 1000;
    await fs.utimes(lockFile, aMinAgo, aMinAgo);

    // mutateState should reclaim the stale lock and proceed.
    const before = Date.now();
    await mutateState(projectPath, (state) => {
      state.events.push({ ts: new Date().toISOString(), type: "note", summary: "claimed stale lock" });
    });
    const elapsed = Date.now() - before;
    assert.ok(elapsed < 3000, `stale-lock reclaim should be fast (<3s), took ${elapsed}ms`);

    const stateFile = harnessPath(projectPath, "state.json");
    const final = JSON.parse(await fs.readFile(stateFile, "utf8"));
    assert.ok(final.events.some((e) => e.summary === "claimed stale lock"),
      "writer must succeed after reclaiming stale lock");

    console.log(`R9-H3-stale PASS: stale lock reclaimed in ${elapsed}ms (<3s budget)`);
  } finally {
    await fs.rm(projectPath, { recursive: true, force: true });
  }
}

console.log("Round 9: cross-process safety + tmp orphan reaper validated.");
