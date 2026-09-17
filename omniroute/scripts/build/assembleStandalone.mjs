#!/usr/bin/env node

/**
 * Minimal standalone bundle assembler for the integration branch.
 *
 * Next.js already creates .build/next/standalone. This step supplies the
 * static/public assets that are intentionally outside Next's standalone tree
 * and exposes the helper functions consumed by build-next-isolated.mjs.
 */

import fs from "node:fs/promises";
import path from "node:path";

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function copyIfPresent(source, destination) {
  if (!(await exists(source))) return false;
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.cp(source, destination, { recursive: true, force: true });
  return true;
}

export async function syncStandaloneNativeAssets(rootDir, fsImpl = fs, log = console) {
  const standalone = path.join(rootDir, process.env.NEXT_DIST_DIR || ".build/next", "standalone");
  const mappings = [
    [path.join(rootDir, "node_modules/better-sqlite3/build"), path.join(standalone, "node_modules/better-sqlite3/build")],
    [path.join(rootDir, "node_modules/better-sqlite3/prebuilds"), path.join(standalone, "node_modules/better-sqlite3/prebuilds")],
  ];
  for (const [src, dst] of mappings) {
    try {
      if (await exists(src)) {
        await fsImpl.mkdir(path.dirname(dst), { recursive: true });
        await fsImpl.cp(src, dst, { recursive: true, force: true });
        log.log(`[assembleStandalone] synced ${path.relative(rootDir, src)}`);
      }
    } catch (error) {
      log.warn(`[assembleStandalone] native asset sync skipped: ${error?.message || error}`);
    }
  }
}

export async function syncStandaloneExtraModules(rootDir, fsImpl = fs, log = console) {
  const standalone = path.join(rootDir, process.env.NEXT_DIST_DIR || ".build/next", "standalone");
  const entries = [
    ["public", "public"],
    ["src/lib/db/migrations", "migrations"],
    ["scripts/dev/healthcheck.mjs", "healthcheck.mjs"],
  ];
  for (const [srcRel, dstRel] of entries) {
    const src = path.join(rootDir, srcRel);
    const dst = path.join(standalone, dstRel);
    try {
      if (await exists(src)) {
        await fsImpl.mkdir(path.dirname(dst), { recursive: true });
        await fsImpl.cp(src, dst, { recursive: true, force: true });
        log.log(`[assembleStandalone] copied ${srcRel}`);
      }
    } catch (error) {
      log.warn(`[assembleStandalone] extra module sync skipped for ${srcRel}: ${error?.message || error}`);
    }
  }
}

export function assembleStandalone({ distDir, outDir, projectRoot, patchTurbopackChunks = false, copyNatives = true, materializeSymlinks = false } = {}) {
  if (!distDir || !outDir || !projectRoot) throw new Error("assembleStandalone requires distDir, outDir and projectRoot");
  const staticDir = path.join(distDir, "static");
  const publicDir = path.join(projectRoot, "public");

  // These copies are synchronous because the caller treats assembly as a final
  // build step and immediately starts the artifact afterward.
  if (fsSyncExists(staticDir)) {
    fsSyncCp(staticDir, path.join(outDir, ".next", "static"));
  }
  if (fsSyncExists(publicDir)) {
    fsSyncCp(publicDir, path.join(outDir, "public"));
  }
  if (copyNatives) {
    for (const [src, dst] of [
      [path.join(projectRoot, "node_modules/better-sqlite3/build"), path.join(outDir, "node_modules/better-sqlite3/build")],
      [path.join(projectRoot, "node_modules/better-sqlite3/prebuilds"), path.join(outDir, "node_modules/better-sqlite3/prebuilds")],
    ]) {
      if (fsSyncExists(src)) fsSyncCp(src, dst);
    }
  }
  return { outDir, patchTurbopackChunks, materializeSymlinks };
}

function fsSyncExists(target) {
  try {
    return requireFsSync().existsSync(target);
  } catch {
    return false;
  }
}

function fsSyncCp(source, destination) {
  const fsSync = requireFsSync();
  fsSync.mkdirSync(path.dirname(destination), { recursive: true });
  fsSync.cpSync(source, destination, { recursive: true, force: true });
}

let _fsSync;
function requireFsSync() {
  if (!_fsSync) {
    // fs/promises is intentionally used above; load sync primitives lazily here.
    // This keeps the public async helpers simple while assembleStandalone remains synchronous.
    // eslint-disable-next-line global-require
    _fsSync = require("node:fs");
  }
  return _fsSync;
}
