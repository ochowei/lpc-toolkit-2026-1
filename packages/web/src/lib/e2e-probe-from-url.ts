export function e2eProbeFromUrl(search: string): boolean {
  return new URLSearchParams(search).get('e2eProbe') === '1';
}
