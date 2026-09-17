#!/usr/bin/env node

/** Minimal standalone bundle assembler for the integration branch. */

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

async function exists(target) {
  try { await fsp.access(target); return true; } catch { return false; }
}

export async function syncStandaloneNativeAssets(rootDir, fsImpl = fsp, log = console) {
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

export async function syncStandaloneExtraModules(rootDir, fsImpl = fsp, log = console) {
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
  if (fs.existsSync(staticDir)) {
    fs.mkdirSync(path.join(outDir, ".next"), { recursive: true });
    fs.cpSync(staticDir, path.join(outDir, ".next", "static"), { recursive: true, force: true });
  }
  if (fs.existsSync(publicDir)) {
    fs.cpSync(publicDir, path.join(outDir, "public"), { recursive: true, force: true });
  }
  if (copyNatives) {
    for (const [src, dst] of [
      [path.join(projectRoot, "node_modules/better-sqlite3/build"), path.join(outDir, "node_modules/better-sqlite3/build")],
      [path.join(projectRoot, "node_modules/better-sqlite3/prebuilds"), path.join(outDir, "node_modules/better-sqlite3/prebuilds")],
    ]) {
      if (fs.existsSync(src)) {
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        fs.cpSync(src, dst, { recursive: true, force: true });
      }
    }
  }
  return { outDir, patchTurbopackChunks, materializeSymlinks };
}
