import { useState } from "react";

/**
 * Local, session-only dark mode toggle for the transcription screen.
 *
 * Intentionally NOT persisted (no localStorage, no `matchMedia` OS
 * preference) — every fresh page load/refresh starts in light mode by
 * product decision. The user turns dark mode on manually when needed; it
 * resets on the next load. Do not add persistence here without checking
 * with the user first (see .clinerules).
 */
export function useDarkMode() {
  const [isDarkMode, setIsDarkMode] = useState(false);

  function toggleDarkMode() {
    setIsDarkMode((prev) => !prev);
  }

  return { isDarkMode, toggleDarkMode };
}
