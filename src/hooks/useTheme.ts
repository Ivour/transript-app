import { useLayoutEffect, useState } from "react";

export type Theme = "dark" | "light";

/** Status-bar / browser chrome color per theme (matches `--canvas`). */
const THEME_COLOR: Record<Theme, string> = {
  dark: "#0a0c0f",
  light: "#eef1f3",
};

function readTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

/**
 * Light/dark theme via `data-theme` on `<html>` (the design tokens and the
 * Tailwind `dark:` variant key off it, see `src/styles/`). Dark is the
 * default, set statically in `index.html` so there is no light flash.
 *
 * Intentionally NOT persisted (no localStorage, no OS preference) — every
 * page load starts dark by product decision (CLAUDE.md). The initial state
 * is read from `<html>` so the choice survives in-app navigation
 * (e.g. to /usage and back), just not a reload.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readTheme);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", THEME_COLOR[theme]);
  }, [theme]);

  function toggleTheme() {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }

  return { theme, toggleTheme };
}
