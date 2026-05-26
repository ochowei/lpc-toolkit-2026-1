/**
 * Trigger a browser download by creating an anonymous anchor with a Blob
 * URL. The temporary anchor is appended → clicked → removed in the same
 * task; the URL is revoked on the next microtask so the download has time
 * to start.
 *
 * Kept as a standalone helper (not tied to the popover) so future
 * sub-projects (ZIP exporter etc.) can reuse it.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoke so the browser has actually fetched the blob URL.
  queueMicrotask(() => URL.revokeObjectURL(url));
}
