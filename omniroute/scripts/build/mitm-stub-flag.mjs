/**
 * Decide whether the Turbopack build should alias @/mitm/manager to the
 * feature-degraded stub. The alias is opt-in for container builds.
 */
export function shouldStubMitmManager(env = process.env) {
  return env.OMNIROUTE_MITM_STUB === "1";
}

/** Turbopack resolveAlias fragment for @/mitm/manager, derived from env. */
export function mitmManagerAliasFor(env = process.env) {
  return shouldStubMitmManager(env)
    ? { "@/mitm/manager": "./src/mitm/manager.stub.ts" }
    : {};
}
