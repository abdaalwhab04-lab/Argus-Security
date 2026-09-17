#!/usr/bin/env node

/**
 * Lightweight backend-only build helpers.
 *
 * The integration branch does not enable OMNIROUTE_BUILD_BACKEND_ONLY, but
 * build-next-isolated.mjs imports these helpers unconditionally. Keep the
 * helpers dependency-free so normal production builds do not require the
 * optional dashboard stubbing machinery.
 */

export function isBackendOnlyBuild(env = process.env) {
  return env.OMNIROUTE_BUILD_BACKEND_ONLY === "1";
}

export function stubDashboardPages() {
  return [];
}

export function restoreDashboardPages() {
  // No-op when no pages were stubbed.
}
