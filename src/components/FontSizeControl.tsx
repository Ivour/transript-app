import { AArrowDown, AArrowUp } from "lucide-react";
import { useFontSize } from "../hooks/useFontSize";

const stepButtonClassName =
  "grid h-10 w-11.5 place-items-center rounded-full text-ink disabled:opacity-35 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-focus";

/**
 * A− / A+ segment that resizes the transcript text (see `useFontSize`).
 * Deliberately self-contained: it owns the font size state itself, so a
 * tap only re-renders this control, not `TranscribePage`/`TranscriptView`
 * (see `useFontSize` doc comment for the rationale).
 */
export default function FontSizeControl() {
  const { increaseFontSize, decreaseFontSize, canIncrease, canDecrease } =
    useFontSize();

  return (
    <div
      className="flex h-12 flex-none items-center rounded-full bg-glass-strong p-1"
      role="group"
      aria-label="Velikost písma"
    >
      <button
        type="button"
        onClick={decreaseFontSize}
        disabled={!canDecrease}
        aria-label="Zmenšit písmo přepisu"
        className={stepButtonClassName}
      >
        <AArrowDown className="size-5.5" />
      </button>
      <span className="h-5 w-px bg-hairline" />
      <button
        type="button"
        onClick={increaseFontSize}
        disabled={!canIncrease}
        aria-label="Zvětšit písmo přepisu"
        className={stepButtonClassName}
      >
        <AArrowUp className="size-5.5" />
      </button>
    </div>
  );
}
