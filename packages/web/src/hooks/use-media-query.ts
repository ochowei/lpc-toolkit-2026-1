import { useEffect, useState } from 'react';

type MatchMedia = typeof window.matchMedia;

/** SSR-safe media-query read used by the hook initializer and unit tests. */
export function readMediaQuery(
  query: string,
  matchMedia: MatchMedia | undefined,
): boolean {
  if (!matchMedia) return false;
  return matchMedia(query).matches;
}

/** Subscribe to a browser media query and return its current match state. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    readMediaQuery(
      query,
      typeof window === 'undefined' ? undefined : window.matchMedia,
    ),
  );

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, [query]);

  return matches;
}
