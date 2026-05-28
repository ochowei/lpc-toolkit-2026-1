import { useEffect, useState } from 'react';

type MatchMedia = typeof window.matchMedia;

export function readMediaQuery(
  query: string,
  matchMedia: MatchMedia | undefined,
): boolean {
  if (!matchMedia) return false;
  return matchMedia(query).matches;
}

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
