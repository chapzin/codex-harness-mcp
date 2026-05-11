import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkLocalFilesystem, ensureHarness } from "../assets/codex-harness-mcp/src/core.mjs";

const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-harness-netfs-"));

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

async function writeMounts(name, content) {
  const file = path.join(tmpRoot, name);
  await fs.writeFile(file, content, "utf8");
  return file;
}

try {
  const procMountsNfs = await writeMounts(
    "mounts-nfs",
    [
      "/dev/sda1 / ext4 rw,relatime 0 0",
      "tmpfs /tmp tmpfs rw,relatime 0 0",
      "server.example.com:/export /home/user/project nfs4 rw,relatime,vers=4 0 0",
      ""
    ].join("\n")
  );

  const projectOnNfs = "/home/user/project/sub";
  const nfsResult = await checkLocalFilesystem(projectOnNfs, { procMountsPath: procMountsNfs });
  check(
    "nfs.detected-as-network",
    nfsResult.isLocal === false && nfsResult.fsType === "nfs4",
    JSON.stringify(nfsResult)
  );
  check(
    "nfs.warning-present",
    typeof nfsResult.warning === "string" && nfsResult.warning.length > 0,
    `warning was: ${nfsResult.warning}`
  );

  const procMountsCifs = await writeMounts(
    "mounts-cifs",
    [
      "/dev/sda1 / ext4 rw 0 0",
      "//server/share /mnt/share cifs rw,vers=3.0 0 0",
      ""
    ].join("\n")
  );
  const cifsResult = await checkLocalFilesystem("/mnt/share/work", { procMountsPath: procMountsCifs });
  check(
    "cifs.detected-as-network",
    cifsResult.isLocal === false && cifsResult.fsType === "cifs",
    JSON.stringify(cifsResult)
  );

  const procMountsLocal = await writeMounts(
    "mounts-local",
    [
      "/dev/sdd / ext4 rw,relatime 0 0",
      "tmpfs /tmp tmpfs rw,relatime 0 0",
      ""
    ].join("\n")
  );
  const localResult = await checkLocalFilesystem("/home/chapzin/codex-harness-mcp", {
    procMountsPath: procMountsLocal
  });
  check(
    "ext4.not-network",
    localResult.isLocal === true && localResult.fsType === "ext4",
    JSON.stringify(localResult)
  );

  const procMountsWsl = await writeMounts(
    "mounts-wsl",
    [
      "/dev/sdd / ext4 rw,relatime 0 0",
      "drvfs /mnt/c 9p ro,nosuid 0 0",
      ""
    ].join("\n")
  );
  const wslResult = await checkLocalFilesystem("/mnt/c/Users/foo", { procMountsPath: procMountsWsl });
  check(
    "wsl-9p.not-network",
    wslResult.isLocal === true && wslResult.fsType === "9p",
    "9p in WSL2 is local hypervisor; must not be flagged as network. " + JSON.stringify(wslResult)
  );

  const longestResult = await checkLocalFilesystem("/home/user/project/sub/nested/deep", {
    procMountsPath: procMountsNfs
  });
  check(
    "longest-prefix-match",
    longestResult.mountPoint === "/home/user/project" && longestResult.fsType === "nfs4",
    JSON.stringify(longestResult)
  );

  const missingProcResult = await checkLocalFilesystem("/anywhere", {
    procMountsPath: path.join(tmpRoot, "does-not-exist")
  });
  check(
    "missing-proc-mounts.graceful-fallback",
    missingProcResult.isLocal === true && missingProcResult.fsType === "unknown",
    JSON.stringify(missingProcResult)
  );

  const projectDirNet = await fs.mkdtemp(path.join(os.tmpdir(), "codex-harness-netfs-warn-"));
  const procMountsNetWarn = await writeMounts(
    "mounts-warn",
    [
      "/dev/sda1 / ext4 rw 0 0",
      `tmpfs ${projectDirNet} nfs rw 0 0`,
      ""
    ].join("\n")
  );

  const origWrite = process.stderr.write;
  let captured = "";
  process.stderr.write = (chunk) => {
    captured += String(chunk);
    return true;
  };
  process.env.HARNESS_PROC_MOUNTS_PATH = procMountsNetWarn;
  try {
    await ensureHarness({ project_path: projectDirNet });
  } finally {
    process.stderr.write = origWrite;
    delete process.env.HARNESS_PROC_MOUNTS_PATH;
  }
  check(
    "ensureHarness.warns-on-network",
    /network/i.test(captured) && /nfs/i.test(captured),
    `stderr was: ${captured.slice(0, 200)}`
  );

  const projectDirBlock = await fs.mkdtemp(path.join(os.tmpdir(), "codex-harness-netfs-block-"));
  const procMountsBlock = await writeMounts(
    "mounts-block",
    [
      "/dev/sda1 / ext4 rw 0 0",
      `tmpfs ${projectDirBlock} cifs rw 0 0`,
      ""
    ].join("\n")
  );
  process.env.HARNESS_PROC_MOUNTS_PATH = procMountsBlock;
  process.env.HARNESS_REQUIRE_LOCAL_FS = "1";
  let threwBlock = false;
  try {
    await ensureHarness({ project_path: projectDirBlock });
  } catch (err) {
    threwBlock = /network|local|cifs/i.test(err?.message || "");
  } finally {
    delete process.env.HARNESS_PROC_MOUNTS_PATH;
    delete process.env.HARNESS_REQUIRE_LOCAL_FS;
  }
  check(
    "ensureHarness.blocks-when-require-local-fs",
    threwBlock,
    "expected throw with network/local/cifs in message"
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
} finally {
  await fs.rm(tmpRoot, { recursive: true, force: true });
}
