#!/usr/bin/env node

import fs from "node:fs/promises";
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  assembleStandalone,
  syncStandaloneNativeAssets as _syncNativeAssets,
  syncStandaloneExtraModules as _syncExtraModules,
} from "./assembleStandalone.mjs";
import {
  isBackendOnlyBuild,
  stubDashboardPages,
  restoreDashboardPages,
} from "./backendOnlyPages.mjs";

const projectRoot = process.cwd();
const distDir = path.resolve(process.env.NEXT_DIST_DIR || ".build/next");
const backupRoot = path.join(os.tmpdir(), `omniroute-build-isolated-${process.pid}-${Date.now()}`);

export function getTransientBuildPaths(rootDir = projectRoot, env = process.env) {
  const paths = [{
    label: "local Wine prefix",
    sourcePath: path.join(rootDir, ".tmp", "wine32"),
    backupPath: path.join(backupRoot, "wine32"),
  }];
  if (env.OMNIROUTE_BUILD_MOVE_TASKS === "1") {
    paths.push({
      label: "task planning workspace",
      sourcePath: path.join(rootDir, "_tasks"),
      backupPath: path.join(backupRoot, "_tasks"),
    });
  }
  return paths;
}

async function exists(targetPath) {
  try { await fs.access(targetPath); return true; } catch { return false; }
}

export async function movePath(sourcePath, destinationPath, fsImpl = fs) {
  const mkdir = typeof fsImpl.mkdir === "function" ? fsImpl.mkdir.bind(fsImpl) : fs.mkdir.bind(fs);
  await mkdir(path.dirname(destinationPath), { recursive: true });
  try {
    await fsImpl.rename(sourcePath, destinationPath);
  } catch (error) {
    if (error?.code !== "EXDEV") throw error;
    console.warn(`[build-next-isolated] EXDEV while moving ${sourcePath} -> ${destinationPath}; falling back to copy/remove`);
    await fsImpl.cp(sourcePath, destinationPath, { recursive: true, preserveTimestamps: true, force: false, errorOnExist: true });
    await fsImpl.rm(sourcePath, { recursive: true, force: true });
  }
}

export function ensureWindowsBuildProfileDirs(env, mkdirImpl = mkdirSync) {
  if (!env?.APPDATA || !env?.LOCALAPPDATA) return;
  mkdirImpl(env.APPDATA, { recursive: true });
  mkdirImpl(env.LOCALAPPDATA, { recursive: true });
}

export function resolveNextBuildBundlerFlag(baseEnv = process.env) {
  if (process.versions.bun || baseEnv.OMNIROUTE_USE_TURBOPACK === "0") return "--webpack";
  return "--turbopack";
}

export function getWindowsBuildProfileDir() {
  return path.join(os.tmpdir(), `omniroute-build-winhome-${process.pid}`);
}

export function resolveNextBuildEnv(baseEnv = process.env, platform = process.platform) {
  const env = {
    ...baseEnv,
    NEXT_PRIVATE_BUILD_WORKER: baseEnv.NEXT_PRIVATE_BUILD_WORKER || "0",
    OMNIROUTE_BUILDING: "1",
    NEXT_TELEMETRY_DISABLED: baseEnv.NEXT_TELEMETRY_DISABLED || "1",
  };
  if (platform === "win32" && !baseEnv.NEXT_DIST_DIR) {
    const buildHomeDir = getWindowsBuildProfileDir();
    env.HOME = buildHomeDir;
    env.USERPROFILE = buildHomeDir;
    env.APPDATA = path.join(buildHomeDir, "AppData", "Roaming");
    env.LOCALAPPDATA = path.join(buildHomeDir, "AppData", "Local");
  }
  if (!/--max-old-space-size/.test(env.NODE_OPTIONS || "")) {
    const heapMb = Number(baseEnv.OMNIROUTE_BUILD_MEMORY_MB) || 8192;
    env.NODE_OPTIONS = `${env.NODE_OPTIONS || ""} --max-old-space-size=${heapMb}`.trim();
  }
  return env;
}

function runNextBuild() {
  return new Promise((resolve) => {
    const nextBin = path.join(projectRoot, "node_modules", "next", "dist", "bin", "next");
    const buildEnv = resolveNextBuildEnv(process.env);
    ensureWindowsBuildProfileDirs(buildEnv);
    const nextArgs = process.versions.bun
      ? ["--preload", path.join(projectRoot, "open-sse", "utils", "setupPolyfill.ts"), nextBin, "build", resolveNextBuildBundlerFlag()]
      : [nextBin, "build", resolveNextBuildBundlerFlag()];
    const child = spawn(process.execPath, nextArgs, { cwd: projectRoot, stdio: "inherit", env: buildEnv });
    const forward = (signal) => { if (!child.killed) child.kill(signal); };
    process.on("SIGINT", forward);
    process.on("SIGTERM", forward);
    child.on("exit", (code, signal) => {
      process.off("SIGINT", forward);
      process.off("SIGTERM", forward);
      resolve(signal ? { code: 1, signal } : { code: code ?? 1, signal: null });
    });
  });
}

async function resetStandaloneOutput(rootDir = projectRoot, fsImpl = fs) {
  const resolvedDistDir = rootDir === projectRoot ? distDir : path.join(rootDir, process.env.NEXT_DIST_DIR || ".build/next");
  const standaloneRoot = path.join(resolvedDistDir, "standalone");
  if (!(await exists(standaloneRoot))) return;
  await movePath(standaloneRoot, path.join(backupRoot, "standalone-stale"), fsImpl);
  console.log("[build-next-isolated] Moved stale standalone output out of the build path");
}

export async function pruneStandaloneArtifacts(rootDir = projectRoot, fsImpl = fs) {
  const resolvedDistDirForPrune = rootDir === projectRoot ? distDir : path.join(rootDir, process.env.NEXT_DIST_DIR || ".build/next");
  const standaloneRoot = path.join(resolvedDistDirForPrune, "standalone");
  const pruneTargets = [path.join(standaloneRoot, "_tasks")];
  for (const targetPath of pruneTargets) {
    if (!(await exists(targetPath))) continue;
    await fsImpl.rm(targetPath, { recursive: true, force: true });
    console.log(`[build-next-isolated] Pruned standalone artifact: ${path.relative(rootDir, targetPath)}`);
  }
}

export async function syncStandaloneNativeAssets(rootDir = projectRoot, fsImpl = fs, log = console) {
  return _syncNativeAssets(rootDir, fsImpl, log);
}

export async function syncStandaloneExtraModules(rootDir = projectRoot, fsImpl = fs, log = console) {
  return _syncExtraModules(rootDir, fsImpl, log);
}

export async function main() {
  const movedPaths = [];
  const transientBuildPaths = getTransientBuildPaths();
  let stubbedPages = [];
  const restoreStubbedPagesOnce = () => {
    if (stubbedPages.length > 0) {
      restoreDashboardPages(stubbedPages);
      stubbedPages = [];
    }
  };
  const onFatalSignal = (signal) => {
    console.warn(`[build-next-isolated] Received ${signal} — restoring stubbed pages before exit`);
    restoreStubbedPagesOnce();
    process.exit(1);
  };

  try {
    for (const entry of transientBuildPaths) {
      if (!(await exists(entry.sourcePath))) continue;
      await movePath(entry.sourcePath, entry.backupPath);
      movedPaths.push(entry);
    }
    if (isBackendOnlyBuild()) {
      console.log("[build-next-isolated] OMNIROUTE_BUILD_BACKEND_ONLY set — building API only (dashboard UI stubbed)");
      stubbedPages = stubDashboardPages(projectRoot);
      process.once("SIGINT", onFatalSignal);
      process.once("SIGTERM", onFatalSignal);
    }
    await resetStandaloneOutput(projectRoot);
    const result = await runNextBuild();
    const standaloneDir = path.join(distDir, "standalone");
    if (result.code === 0 && (await exists(standaloneDir))) {
      try {
        await fs.cp(path.join(projectRoot, "docs"), path.join(standaloneDir, "docs"), { recursive: true });
        console.log("[build-next-isolated] Copied docs/ to standalone output");
      } catch (docsCopyErr) {
        console.warn("[build-next-isolated] Non-fatal error copying docs/: ", docsCopyErr?.message);
      }
      try { await pruneStandaloneArtifacts(projectRoot); }
      catch (pruneErr) { console.warn("[build-next-isolated] Non-fatal error pruning standalone artifacts:", pruneErr); }
      try {
        const { buildTproxyNative } = await import("./build-tproxy-native.mjs");
        const res = buildTproxyNative(projectRoot);
        console.log(res.built ? "[build-next-isolated] Built TPROXY native addon (transparent.node)" : `[build-next-isolated] TPROXY native addon skipped: ${res.reason}`);
      } catch (nativeErr) {
        console.warn("[build-next-isolated] Non-fatal error building TPROXY native addon:", nativeErr?.message);
      }
      try {
        console.log("[build-next-isolated] Assembling standalone bundle (static + public + natives + extras)...");
        assembleStandalone({ distDir, outDir: standaloneDir, projectRoot, patchTurbopackChunks: true, copyNatives: true, materializeSymlinks: true });
        const { spawnSync } = await import("node:child_process");
        const basePathWrite = spawnSync(process.execPath, [path.join(projectRoot, "scripts", "build", "write-build-base-path.mjs")], { cwd: projectRoot, env: process.env, stdio: "inherit" });
        if (basePathWrite.status !== 0) console.warn("[build-next-isolated] Non-fatal error writing BUILD_OMNIROUTE_BASE_PATH sentinel");
      } catch (assembleErr) {
        console.error("[build-next-isolated] Failed to assemble standalone bundle:", assembleErr);
        process.exitCode = 1;
      }
    }
    if (result.code !== 0) process.exitCode = result.code;
  } catch (error) {
    console.error("[build-next-isolated] Build failed:", error);
    process.exitCode = 1;
  } finally {
    restoreStubbedPagesOnce();
    for (const entry of [...movedPaths].reverse()) {
      try {
        if (await exists(entry.backupPath)) await movePath(entry.backupPath, entry.sourcePath);
      } catch (restoreErr) {
        console.error(`[build-next-isolated] Failed to restore ${entry.label}:`, restoreErr);
        process.exitCode = 1;
      }
    }
  }
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  await main();
}
