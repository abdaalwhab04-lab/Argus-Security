/** Normalize OMNIROUTE_BASE_PATH for Next.js basePath and Docker sentinels. */
export function normalizeBasePath(value) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed || trimmed === "/") return "";
  if (!trimmed.startsWith("/") || /[?#\\]/.test(trimmed)) return "";
  const segments = trimmed.split("/").filter(Boolean);
  if (segments.some((segment) => segment === "." || segment === "..")) return "";
  return `/${segments.join("/")}`;
}

export function joinBasePath(basePath, pathname) {
  const pathPart = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (!basePath) return pathPart;
  if (pathPart === "/") return `${basePath}/`;
  return `${basePath}${pathPart}`;
}
