import { useLayoutEffect, useState } from "react";

const MIN_FONT_SIZE_PX = 14;
const MAX_FONT_SIZE_PX = 30;
const STEP_PX = 2;

/** Slightly larger than the previous static `text-base` (16px) default. */
export const DEFAULT_FONT_SIZE_PX = 18;

const FONT_SIZE_CSS_VAR = "--transcript-font-size";

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
 * variable directly via inline `style` and never re-renders because of it.
 *
 * Session-only, like `useDarkMode` — intentionally NOT persisted
 * (no localStorage); always resets to `DEFAULT_FONT_SIZE_PX` on page load.
 */
export function useFontSize() {
  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE_PX);

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
