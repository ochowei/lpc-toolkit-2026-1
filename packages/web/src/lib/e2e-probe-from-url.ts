/** Enable the browser-only E2E probe object from `?e2eProbe=1`. */
export function e2eProbeFromUrl(search: string): boolean {
  return new URLSearchParams(search).get('e2eProbe') === '1';
}
