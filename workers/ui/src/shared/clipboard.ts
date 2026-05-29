/**
 * Copy text to the clipboard, tolerating environments without the async
 * Clipboard API (older browsers, insecure contexts, jsdom in tests).
 * Returns `true` when the copy is believed to have succeeded.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to a no-op; the caller decides whether to surface failure
  }
  return false;
}
