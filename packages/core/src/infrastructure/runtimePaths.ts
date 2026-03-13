import { isJatosAvailable } from "./jatos";

const ABSOLUTE_URL_RE = /^(?:[a-z][a-z0-9+.-]*:)?\/\//i;

function isAbsoluteLike(path: string): boolean {
  return (
    ABSOLUTE_URL_RE.test(path)
    || path.startsWith("data:")
    || path.startsWith("blob:")
    || path.startsWith("mailto:")
    || path.startsWith("tel:")
  );
}

export function resolveRuntimePath(path: string): string {
  const raw = String(path ?? "").trim();
  if (!raw || isAbsoluteLike(raw)) return raw;
  const hadLeadingSlash = raw.startsWith("/");
  const normalized = raw.replace(/^\/+/, "");
  if (isJatosAvailable()) return normalized;
  return hadLeadingSlash ? `/${normalized}` : normalized;
}

