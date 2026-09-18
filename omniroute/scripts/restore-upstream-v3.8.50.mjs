import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readdir, rm, cp, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const execFileAsync = promisify(execFile);
const ROOT = resolve(new URL(".", import.meta.url).pathname, "..");
const URL = "https://github.com/diegosouzapw/OmniRoute/archive/refs/tags/v3.8.50.tar.gz";
const REQUIRED = [
  "src/lib/usageDb.ts",
  "src/lib/db/core.ts",
  "src/lib/db/apiKeys.ts",
  "src/lib/modelCapabilities.ts",
];

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

if ((await Promise.all(REQUIRED.map((p) => exists(join(ROOT, p))))).every(Boolean)) {
  console.log("OmniRoute upstream source check: complete");
  process.exit(0);
}

const temp = await mkdtemp(join(tmpdir(), "omniroute-v3.8.50-"));
const archive = join(temp, "omniroute.tar.gz");

try {
  console.log("OmniRoute source is incomplete; restoring missing files from official v3.8.50 release...");
  await execFileAsync("curl", ["-fsSL", "--retry", "3", "--connect-timeout", "15", URL, "-o", archive], { cwd: ROOT });
  await execFileAsync("tar", ["-xzf", archive, "-C", temp], { cwd: ROOT });

  const entries = (await readdir(temp)).filter((name) => name !== "omniroute.tar.gz");
  if (entries.length !== 1) throw new Error("Could not identify upstream OmniRoute archive root");
  const upstream = join(temp, entries[0]);

  const result = await execFileAsync(
    "bash",
    ["-lc", "find . -type f -not -path './.git/*' -not -path './node_modules/*' -not -path './dist/*'"],
    { cwd: upstream, maxBuffer: 20 * 1024 * 1024 }
  );

  let restored = 0;
  for (const raw of result.stdout.split("\n")) {
    const rel = raw.trim().replace(/^\.\//, "");
    if (!rel) continue;
    if (
      rel === "package.json" ||
      rel === "package-lock.json" ||
      rel === "pnpm-lock.yaml" ||
      rel.startsWith(".git/") ||
      rel.startsWith(".github/") ||
      rel.startsWith("node_modules/") ||
      rel.startsWith("dist/")
    ) continue;

    const target = join(ROOT, rel);
    if (await exists(target)) continue;
    await cp(join(upstream, rel), target, { recursive: true, force: false });
    restored++;
  }

  console.log(`OmniRoute upstream source restore: restored ${restored} missing files`);
} finally {
  await rm(temp, { recursive: true, force: true });
}
