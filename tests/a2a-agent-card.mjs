import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { exportAgentCard } from "../assets/codex-harness-mcp/src/core.mjs";

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

const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "codex-harness-a2a-"));

try {
  const mockTools = [
    { name: "harness_bootstrap", description: "Create harness workspace." },
    { name: "harness_create_contract", description: "Bound execution contract." },
    { name: "harness_record_trace", description: "Persist a structured trace." }
  ];

  const card = await exportAgentCard({
    project_path: projectPath,
    tools: mockTools,
    base_url: "https://harness.example.com/a2a"
  });

  check(
    "card.has-required-fields",
    typeof card.name === "string" &&
      typeof card.description === "string" &&
      typeof card.version === "string" &&
      card.name.length > 0 &&
      card.version.length > 0,
    JSON.stringify({ name: card.name, version: card.version })
  );

  check(
    "card.version-matches-package",
    card.version === "0.2.0",
    `expected 0.2.0 from package.json; got ${card.version}`
  );

  check(
    "card.capabilities.no-streaming-no-push",
    card.capabilities &&
      card.capabilities.streaming === false &&
      card.capabilities.pushNotifications === false,
    JSON.stringify(card.capabilities)
  );

  check(
    "card.default-input-output-modes",
    Array.isArray(card.defaultInputModes) &&
      Array.isArray(card.defaultOutputModes) &&
      card.defaultInputModes.includes("application/json") &&
      card.defaultOutputModes.includes("application/json"),
    JSON.stringify({ inputs: card.defaultInputModes, outputs: card.defaultOutputModes })
  );

  check(
    "card.supportedInterfaces-shape",
    Array.isArray(card.supportedInterfaces) &&
      card.supportedInterfaces.length === 1 &&
      card.supportedInterfaces[0].url === "https://harness.example.com/a2a" &&
      typeof card.supportedInterfaces[0].protocolBinding === "string",
    JSON.stringify(card.supportedInterfaces)
  );

  check(
    "card.skills-derived-from-tools",
    Array.isArray(card.skills) &&
      card.skills.length === mockTools.length &&
      card.skills.every((s) => typeof s.id === "string" && typeof s.name === "string" && typeof s.description === "string"),
    JSON.stringify(card.skills?.map((s) => s.id))
  );

  const bootstrapSkill = card.skills.find((s) => s.id === "harness_bootstrap");
  check(
    "card.skill.preserves-tool-name-and-description",
    bootstrapSkill &&
      bootstrapSkill.description === "Create harness workspace." &&
      Array.isArray(bootstrapSkill.tags) &&
      bootstrapSkill.tags.length > 0,
    JSON.stringify(bootstrapSkill)
  );

  check(
    "card.skills.input-output-modes-present",
    card.skills.every(
      (s) =>
        Array.isArray(s.inputModes) &&
        Array.isArray(s.outputModes) &&
        s.inputModes.length > 0 &&
        s.outputModes.length > 0
    ),
    "every skill must declare inputModes and outputModes"
  );

  // --- Edge: no base_url → supportedInterfaces is empty array (not undefined) ---
  const cardNoUrl = await exportAgentCard({
    project_path: projectPath,
    tools: mockTools
  });
  check(
    "card.no-base-url.empty-interfaces",
    Array.isArray(cardNoUrl.supportedInterfaces) && cardNoUrl.supportedInterfaces.length === 0,
    JSON.stringify(cardNoUrl.supportedInterfaces)
  );

  // --- Edge: empty tools list → skills is empty array, not undefined ---
  const cardNoTools = await exportAgentCard({
    project_path: projectPath,
    tools: []
  });
  check(
    "card.no-tools.empty-skills",
    Array.isArray(cardNoTools.skills) && cardNoTools.skills.length === 0,
    JSON.stringify(cardNoTools.skills)
  );

  // --- Edge: tools as null/undefined → still returns array ---
  const cardUndefTools = await exportAgentCard({
    project_path: projectPath
  });
  check(
    "card.undefined-tools.empty-skills",
    Array.isArray(cardUndefTools.skills) && cardUndefTools.skills.length === 0,
    JSON.stringify(cardUndefTools.skills)
  );

  // --- Override: explicit name/description/version takes priority ---
  const overrideCard = await exportAgentCard({
    project_path: projectPath,
    tools: [],
    name: "Custom Agent",
    description: "Overridden description",
    version: "9.9.9"
  });
  check(
    "card.explicit-fields-override-package",
    overrideCard.name === "Custom Agent" &&
      overrideCard.description === "Overridden description" &&
      overrideCard.version === "9.9.9",
    JSON.stringify(overrideCard)
  );

  // --- Serialization: full card is JSON-stringifiable ---
  let serialized = null;
  try {
    serialized = JSON.stringify(card);
  } catch (err) {
    serialized = null;
  }
  check(
    "card.serializable-as-json",
    typeof serialized === "string" && serialized.length > 100,
    serialized ? `len=${serialized.length}` : "non-serializable"
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
} finally {
  await fs.rm(projectPath, { recursive: true, force: true });
}
