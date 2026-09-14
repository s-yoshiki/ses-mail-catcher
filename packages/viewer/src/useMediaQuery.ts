import { useEffect, useState } from 'react';

/**
 * The narrow-screen breakpoint (single-pane navigation, compact toolbar,
 * larger touch targets). Kept in sync with the `@media (max-width: 720px)`
 * rules in `styles.css` — this hook is for *structural* decisions (which
 * components render at all), while the stylesheet handles purely visual
 * ones.
 */
export const NARROW_QUERY = '(max-width: 720px)';

/**
 * Tracks whether `query` currently matches, via `matchMedia`, updating live
 * as the viewport changes (a resize, or DevTools device emulation).
 */
export const useMediaQuery = (query: string): boolean => {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const mediaQueryList = window.matchMedia(query);
    const handleChange = (): void => setMatches(mediaQueryList.matches);

    handleChange();
    mediaQueryList.addEventListener('change', handleChange);
    return () => mediaQueryList.removeEventListener('change', handleChange);
  }, [query]);

  return matches;
};
