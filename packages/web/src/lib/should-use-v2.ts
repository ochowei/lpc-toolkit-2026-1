export function shouldUseV2(search: string): boolean {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  return params.get('ui') === 'v2';
}
