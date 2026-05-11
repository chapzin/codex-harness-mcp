import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { mutateState, createContract } from "../assets/codex-harness-mcp/src/core.mjs";
import {
  readHarnessResource,
  clearResourceCache
} from "../assets/codex-harness-mcp/src/mcp-features.mjs";

const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "codex-harness-etag-"));

let passed = 0;
let failed = 0;

function check(name, condition, detail) {
  if (condition) {
    console.log(`PASS: ${name}`);
    passed++;
  } else {
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

try {
  await createContract({
    project_path: projectPath,
    title: "etag cache contract",
    goal: "Seed state for etag cache tests"
  });

  clearResourceCache();

  const first = await readHarnessResource("harness://state", { project_path: projectPath });
  const firstContent = first.contents[0];

  check(
    "etag.present",
    firstContent && firstContent._meta && typeof firstContent._meta.etag === "string",
    "expected contents[0]._meta.etag string"
  );

  const etagFormat = /^sha256:[a-f0-9]{64}$/;
  check(
    "etag.format-sha256-hex",
    etagFormat.test(firstContent?._meta?.etag || ""),
    `etag was: ${firstContent?._meta?.etag}`
  );

  const second = await readHarnessResource("harness://state", { project_path: projectPath });
  check(
    "etag.stable-when-content-unchanged",
    second.contents[0]._meta.etag === firstContent._meta.etag,
    `first=${firstContent._meta.etag} second=${second.contents[0]._meta.etag}`
  );

  check(
    "cache.hit-returns-same-object-within-ttl",
    second === first,
    "expected same payload object reference on second read within TTL"
  );

  clearResourceCache();
  const third = await readHarnessResource("harness://state", { project_path: projectPath });
  check(
    "cache.invalidate-after-clear",
    third !== first,
    "expected different object reference after clearResourceCache"
  );
  check(
    "etag.same-content-same-etag-after-clear",
    third.contents[0]._meta.etag === firstContent._meta.etag,
    "content did not change so etag should be identical"
  );

  clearResourceCache();
  await mutateState(projectPath, (state) => {
    state.focus = "new focus changes state.json";
  });
  clearResourceCache();
  const afterMutation = await readHarnessResource("harness://state", { project_path: projectPath });
  check(
    "etag.changes-when-content-changes",
    afterMutation.contents[0]._meta.etag !== firstContent._meta.etag,
    `before=${firstContent._meta.etag} after=${afterMutation.contents[0]._meta.etag}`
  );

  clearResourceCache();
  process.env.HARNESS_RESOURCE_CACHE_LIMIT = "2";
  const a = await readHarnessResource("harness://state", { project_path: projectPath });
  await readHarnessResource("harness://contracts", { project_path: projectPath });
  await readHarnessResource("harness://traces/recent", { project_path: projectPath });
  const a2 = await readHarnessResource("harness://state", { project_path: projectPath });
  check(
    "cache.size-cap-evicts-oldest",
    a2 !== a,
    "with size cap 2 and 3 distinct uris, state entry should have been evicted"
  );
  delete process.env.HARNESS_RESOURCE_CACHE_LIMIT;

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
} finally {
  await fs.rm(projectPath, { recursive: true, force: true });
}
