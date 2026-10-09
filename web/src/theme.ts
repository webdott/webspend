import type { Theme } from '@webspend/shared';

/** Applies the theme setting: `auto` follows the system via `prefers-color-scheme` in CSS. */
export function applyTheme(theme: Theme | null | undefined) {
  const root = document.documentElement;
  if (!theme || theme === 'auto') delete root.dataset.theme;
  else root.dataset.theme = theme;
}
