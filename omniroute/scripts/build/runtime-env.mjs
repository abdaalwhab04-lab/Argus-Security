import { spawn } from "node:child_process";

export function parsePort(value, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 65535 ? parsed : fallback;
}

export function resolveMaxOldSpaceMb(value, fallback = 512) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed >= 64 && parsed <= 16384 ? parsed : fallback;
}

export function calibrateHeapFallbackMb(totalmemBytes) {
  const totalMb = Number(totalmemBytes) / (1024 * 1024);
  if (!Number.isFinite(totalMb) || totalMb <= 0) return 512;
  return Math.min(4096, Math.max(512, Math.floor(totalMb * 0.35)));
}

const MAX_OLD_SPACE_FLAG = "--max-old-space-size";

export function envHasExplicitHeapFlag(env = process.env) {
  return String(env?.NODE_OPTIONS || "").includes(MAX_OLD_SPACE_FLAG);
}

export function parseNodeOptionsHeapMb(nodeOptions) {
  const matches = [...String(nodeOptions || "").matchAll(/--max-old-space-size=(\d+)/g)];
  if (matches.length === 0) return null;
  const parsed = Number.parseInt(matches[matches.length - 1][1], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function envHasExplicitOmnirouteMemoryMb(env = process.env) {
  const parsed = Number.parseInt(String(env?.OMNIROUTE_MEMORY_MB ?? ""), 10);
  return Number.isFinite(parsed) && parsed >= 64 && parsed <= 16384;
}

export function warnConflictingHeapLimits(env, omnirouteMb, log = console.warn) {
  const nodeMb = parseNodeOptionsHeapMb(env?.NODE_OPTIONS);
  if (nodeMb == null || !envHasExplicitOmnirouteMemoryMb(env) || nodeMb === omnirouteMb) return false;
  log("[omniroute] heap limit conflict: OMNIROUTE_MEMORY_MB=" + omnirouteMb +
    " disagrees with NODE_OPTIONS --max-old-space-size=" + nodeMb);
  return true;
}

export function buildStandaloneNodeOptions(env = process.env, omnirouteMb) {
  const existing = String(env?.NODE_OPTIONS || "").trim();
  if (envHasExplicitOmnirouteMemoryMb(env)) return `${existing} ${MAX_OLD_SPACE_FLAG}=${omnirouteMb}`.trim();
  if (existing.includes(MAX_OLD_SPACE_FLAG)) return existing;
  return `${existing} ${MAX_OLD_SPACE_FLAG}=${omnirouteMb}`.trim();
}

export function buildServerNodeOptions(env = process.env, memoryLimit) {
  const existing = String(env?.NODE_OPTIONS || "").trim();
  if (existing.includes(MAX_OLD_SPACE_FLAG)) return existing;
  return `${existing} ${MAX_OLD_SPACE_FLAG}=${memoryLimit}`.trim();
}

export function buildNodeHeapArgs(env = process.env, memoryLimit) {
  return envHasExplicitHeapFlag(env) ? [] : [`${MAX_OLD_SPACE_FLAG}=${memoryLimit}`];
}

export function buildNodeRuntimeArgs(env = process.env, memoryLimit, serverPath) {
  return ["--dns-result-order=ipv4first", ...buildNodeHeapArgs(env, memoryLimit), serverPath];
}

export function resolveRuntimePorts(fromEnv = process.env) {
  const basePort = parsePort(fromEnv.PORT || "20128", 20128);
  const apiPort = parsePort(fromEnv.API_PORT || String(basePort), basePort);
  const dashboardPort = parsePort(fromEnv.DASHBOARD_PORT || String(basePort), basePort);
  return { basePort, apiPort, dashboardPort };
}

export function withRuntimePortEnv(env, runtimePorts) {
  const { basePort, apiPort, dashboardPort } = runtimePorts;
  return {
    ...env,
    OMNIROUTE_PORT: String(basePort),
    PORT: String(dashboardPort),
    DASHBOARD_PORT: String(dashboardPort),
    API_PORT: String(apiPort),
    HOSTNAME: env.OMNIROUTE_HOSTNAME || "0.0.0.0",
  };
}

export function sanitizeColorEnv(env = {}) {
  const sanitized = { ...env };
  if (typeof sanitized.FORCE_COLOR !== "undefined" && typeof sanitized.NO_COLOR !== "undefined") {
    delete sanitized.FORCE_COLOR;
  }
  return sanitized;
}

export function spawnWithForwardedSignals(command, args, options = {}) {
  const child = spawn(command, args, options);
  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
  process.on("SIGINT", () => child.kill("SIGINT"));
  process.on("SIGTERM", () => child.kill("SIGTERM"));
  return child;
}
