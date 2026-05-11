import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createContract,
  recordEvent,
  queryEvents
} from "../assets/codex-harness-mcp/src/core.mjs";

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

const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "codex-harness-e2-"));

try {
  const contract = await createContract({
    project_path: projectPath,
    title: "e2 host",
    goal: "event sourcing test host"
  });
  const contractId = contract.contract.id;

  // --- Append events ---
  const e1 = await recordEvent({
    project_path: projectPath,
    contract_id: contractId,
    kind: "contract.created",
    summary: "Bootstrapped contract for e2 testing",
    payload: { goal: "event sourcing test host" }
  });
  check(
    "append.first-event-has-id",
    e1.event && typeof e1.event.eventId === "number" && e1.event.eventId > 0,
    JSON.stringify(e1.event)
  );

  const e2 = await recordEvent({
    project_path: projectPath,
    contract_id: contractId,
    kind: "trace.recorded",
    summary: "First tool call",
    payload: { tool: "harness_bootstrap", outcome: "success" },
    parent_event_id: e1.event.eventId
  });
  check(
    "append.parent-link-preserved",
    e2.event && e2.event.parentEventId === e1.event.eventId,
    JSON.stringify(e2.event)
  );

  check(
    "append.event-id-monotonic",
    e2.event.eventId > e1.event.eventId,
    `e1=${e1.event.eventId}, e2=${e2.event.eventId}`
  );

  // --- Different contract ---
  const otherContract = await createContract({
    project_path: projectPath,
    title: "other contract",
    goal: "isolation check"
  });
  const otherId = otherContract.contract.id;

  await recordEvent({
    project_path: projectPath,
    contract_id: otherId,
    kind: "contract.created",
    summary: "different contract event"
  });

  // --- Query by contract_id ---
  const byContract = await queryEvents({
    project_path: projectPath,
    contract_id: contractId
  });
  check(
    "query.filter-by-contract",
    Array.isArray(byContract.events) &&
      byContract.events.length === 2 &&
      byContract.events.every((e) => e.contractId === contractId),
    `count=${byContract.events.length}`
  );

  // --- Query by kind ---
  const byKind = await queryEvents({
    project_path: projectPath,
    kind: "contract.created"
  });
  check(
    "query.filter-by-kind",
    Array.isArray(byKind.events) &&
      byKind.events.length === 2 &&
      byKind.events.every((e) => e.kind === "contract.created"),
    `count=${byKind.events.length}`
  );

  // --- Query by since_id ---
  const sinceFirst = await queryEvents({
    project_path: projectPath,
    since_id: e1.event.eventId
  });
  check(
    "query.filter-by-since-id",
    sinceFirst.events.every((e) => e.eventId > e1.event.eventId),
    `ids=${sinceFirst.events.map((e) => e.eventId).join(",")}`
  );

  // --- Query limit ---
  const limited = await queryEvents({
    project_path: projectPath,
    limit: 1
  });
  check(
    "query.limit-respected",
    limited.events.length === 1,
    `count=${limited.events.length}`
  );

  // --- Replay ordering (ascending by eventId) ---
  const replay = await queryEvents({ project_path: projectPath });
  const ids = replay.events.map((e) => e.eventId);
  const sorted = [...ids].sort((a, b) => a - b);
  check(
    "query.events-ordered-by-id-asc",
    ids.length >= 3 && ids.every((v, i) => v === sorted[i]),
    `ids=${ids.join(",")}`
  );

  // --- WAL journal mode active ---
  const dbDir = path.join(projectPath, ".codex-harness");
  const dirEntries = await fs.readdir(dbDir);
  const hasDb = dirEntries.includes("events.db");
  // WAL mode produces -wal and -shm files alongside the main DB during active writes
  const hasWal = dirEntries.some((entry) => entry === "events.db-wal" || entry === "events.db-shm");
  check(
    "persistence.events-db-exists",
    hasDb,
    `entries=${dirEntries.filter((e) => e.startsWith("events")).join(",")}`
  );
  check(
    "persistence.wal-mode-active",
    hasWal,
    `expected -wal or -shm sidecar; entries=${dirEntries.filter((e) => e.startsWith("events")).join(",")}`
  );

  // --- Validation: kind required ---
  let missingKind = false;
  try {
    await recordEvent({
      project_path: projectPath,
      summary: "no kind"
    });
  } catch (err) {
    missingKind = /kind/i.test(err?.message || "");
  }
  check("append.kind-required", missingKind, "expected throw when kind missing");

  // --- Payload sanitization: objects get serialized ---
  const withObj = await recordEvent({
    project_path: projectPath,
    contract_id: contractId,
    kind: "test.payload",
    summary: "payload check",
    payload: { nested: { deep: true }, list: [1, 2, 3] }
  });
  check(
    "append.payload-serialized",
    withObj.event &&
      typeof withObj.event.payload === "object" &&
      withObj.event.payload.nested &&
      withObj.event.payload.nested.deep === true,
    JSON.stringify(withObj.event.payload)
  );

  // --- Persistence: re-open and query in fresh module state ---
  // We can't unload the module mid-test, but we can verify the DB file is readable
  // by spawning a query that re-opens.
  const refreshed = await queryEvents({
    project_path: projectPath,
    limit: 100
  });
  check(
    "persistence.cross-call-readable",
    refreshed.events.length >= 4,
    `count=${refreshed.events.length}`
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
} finally {
  await fs.rm(projectPath, { recursive: true, force: true });
}
