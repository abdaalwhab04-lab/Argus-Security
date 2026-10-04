/**
 * Shared post-install environment helpers.
 * Kept dependency-free so CLI startup can import it before optional tooling loads.
 */

/**
 * Detect a Termux environment without assuming that Node reports Android as
 * process.platform. Debian/NEXORA must remain a normal Linux environment.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function isTermux(env = process.env) {
  return Boolean(
    env?.TERMUX_VERSION ||
    env?.TERMUX__VERSION ||
    (typeof env?.PREFIX === "string" && /com\.termux/i.test(env.PREFIX)) ||
    (typeof env?.PREFIX === "string" && /termux/i.test(env.PREFIX))
  );
}
