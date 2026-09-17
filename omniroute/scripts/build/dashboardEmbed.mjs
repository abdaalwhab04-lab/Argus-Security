/** Build-time dashboard embedding helpers. */
export const DASHBOARD_EMBED_ENV = "DASHBOARD_ALLOW_EMBED";
export const EMBED_FRAME_ANCESTORS = Object.freeze({
  vscode: "'self' vscode-webview:",
});
export const STRICT_FRAME_ANCESTORS = "frame-ancestors 'none'";
export const STATIC_NON_PAGE_PREFIXES = Object.freeze(["api", "a2a", "healthz"]);

export function resolveDashboardEmbedMode(env = process.env) {
  const raw = env?.[DASHBOARD_EMBED_ENV];
  if (typeof raw !== "string") return null;
  const normalized = raw.trim().toLowerCase();
  return Object.hasOwn(EMBED_FRAME_ANCESTORS, normalized) ? normalized : null;
}

export function nonPageRoutePrefixes(rewriteRules = []) {
  const prefixes = new Set(STATIC_NON_PAGE_PREFIXES);
  for (const { source } of rewriteRules) {
    const first = source.replace(/^\//, "").split("/")[0];
    if (first && !first.startsWith(":")) prefixes.add(first);
  }
  return [...prefixes].sort();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&");
}

export function complementarySources(prefixes) {
  const alternation = prefixes.map(escapeRegExp).join("|");
  const boundary = `(?:${alternation})(?:/|$)`;
  return {
    nonPageSource: `/((?=${boundary}).*)`,
    pageSource: `/((?!${boundary}).*)`,
  };
}

export function relaxFrameAncestors(contentSecurityPolicy, mode) {
  return contentSecurityPolicy.replace(
    STRICT_FRAME_ANCESTORS,
    `frame-ancestors ${EMBED_FRAME_ANCESTORS[mode]}`
  );
}

export function buildSecurityHeaderRules({ mode, securityHeaders, prefixes = [] }) {
  if (!mode) return [{ source: "/:path*", headers: securityHeaders }];
  const { nonPageSource, pageSource } = complementarySources(prefixes);
  const pageHeaders = securityHeaders
    .filter((header) => header.key !== "X-Frame-Options")
    .map((header) =>
      header.key === "Content-Security-Policy"
        ? { key: header.key, value: relaxFrameAncestors(header.value, mode) }
        : header
    );
  return [
    { source: nonPageSource, headers: securityHeaders },
    { source: pageSource, headers: pageHeaders },
  ];
}
