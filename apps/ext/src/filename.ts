// Characters forbidden in common filesystems (Windows, macOS, Linux)
const UNSAFE_CHARS = /[<>:"/\\|?*]/g;

/**
 * Sanitize a string for use as a filename.
 * Replaces unsafe characters and whitespace runs with underscores.
 */
export function sanitizeFilename(raw: string): string {
  return raw
    .replace(UNSAFE_CHARS, "_")
    .replace(/\s+/g, "_")
    .replace(/_{2,}/g, "_")
    .slice(0, 100);
}
