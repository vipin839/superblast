'use client';

import { useEffect } from 'react';
import { usePref } from '@/lib/prefs';

/**
 * Keeps <html data-theme> in sync with the saved preference.
 *
 * There is deliberately no inline bootstrap script: React 19 rejects <script>
 * inside a component and it caused a hydration failure on every page load.
 * The default preference is "system", which the CSS already handles through
 * prefers-color-scheme with no JavaScript at all — so only viewers who have
 * explicitly overridden their OS setting see a single frame before the swap.
 */
export default function ThemeSync() {
  const theme = usePref('blasthub-theme', 'system');

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  }, [theme]);

  return null;
}
