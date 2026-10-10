import { useLayoutEffect, useState } from "react";

// Range/step/default from the livelife design (`text-transcript` = 19px).
const MIN_FONT_SIZE_PX = 15;
const MAX_FONT_SIZE_PX = 27;
const STEP_PX = 2;

export const DEFAULT_FONT_SIZE_PX = 19;

/** Read by `TranscriptView` cards (`text-[length:var(--ts,19px)]`). */
const FONT_SIZE_CSS_VAR = "--ts";

/**
 * Controls the transcript text size via a single CSS custom property on
 * `<html>`, instead of a React prop threaded down into `TranscriptView`.
 *
 * Rationale: `TranscriptView` already re-renders frequently as Soniox
 * tokens stream in, and `TranscribePage` renders the whole screen (header,
 * footer, record button, sensitivity slider...). If font size lived as
 * state in `TranscribePage` and were passed down as a prop, every +/- tap
 * would re-render that entire tree. Instead, the state here is owned by
 * the small standalone `FontSizeControl` component that calls this hook —
 * only that control re-renders on tap. `TranscriptView` reads the CSS
 * variable from a class and never re-renders because of it.
 *
 * Session-only, like `useTheme` — intentionally NOT persisted
 * (no localStorage); always resets to `DEFAULT_FONT_SIZE_PX` on page load.
 * The initial state is read back from `<html>`, so the size survives
 * in-app navigation (e.g. to /usage and back), just not a reload.
 */
function readFontSize(): number {
  const value = parseFloat(
    document.documentElement.style.getPropertyValue(FONT_SIZE_CSS_VAR),
  );
  return Number.isFinite(value) ? value : DEFAULT_FONT_SIZE_PX;
}

export function useFontSize() {
  const [fontSize, setFontSize] = useState(readFontSize);

  // useLayoutEffect (not useEffect) so the CSS variable is applied
  // synchronously before paint — no flash of the previous size.
  useLayoutEffect(() => {
    document.documentElement.style.setProperty(
      FONT_SIZE_CSS_VAR,
      `${fontSize}px`,
    );
  }, [fontSize]);

  function increaseFontSize() {
    setFontSize((size) => Math.min(MAX_FONT_SIZE_PX, size + STEP_PX));
  }

  function decreaseFontSize() {
    setFontSize((size) => Math.max(MIN_FONT_SIZE_PX, size - STEP_PX));
  }

  return {
    increaseFontSize,
    decreaseFontSize,
    canIncrease: fontSize < MAX_FONT_SIZE_PX,
    canDecrease: fontSize > MIN_FONT_SIZE_PX,
  };
}
