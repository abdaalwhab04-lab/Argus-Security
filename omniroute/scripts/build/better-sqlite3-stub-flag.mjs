/**
 * Decide whether the Next.js build should alias `better-sqlite3` to the
 * build-time stub. The alias is opt-in so normal runtime builds keep the
 * real external native package.
 */
export function shouldStubBetterSqlite3(env = process.env) {
  return env.OMNIROUTE_BETTER_SQLITE3_STUB === "1";
}

/** Turbopack resolveAlias fragment for `better-sqlite3`, derived from env. */
export function betterSqlite3AliasFor(env = process.env) {
  return shouldStubBetterSqlite3(env)
    ? { "better-sqlite3": "./src/lib/db/better-sqlite3.stub.js" }
    : {};
}
