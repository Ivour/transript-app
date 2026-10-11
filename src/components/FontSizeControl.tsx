import { useFontSize } from "../hooks/useFontSize";

const stepButtonClassName =
  "grid h-10 w-11.5 place-items-center rounded-full text-ink disabled:opacity-35 focus-ring";

/**
 * Small "A" / big "A" segment that resizes the transcript text (see
 * `useFontSize`). The iOS Safari / Books text-size pattern: the glyphs are
 * text in the rounded brand font, not icons (the lucide A-with-arrow icons
 * read as cluttered), so their size difference itself says smaller/bigger.
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
        <span aria-hidden className="font-rounded text-[15px]/none font-semibold">
          A
        </span>
      </button>
      <span className="h-5 w-px bg-hairline" />
      <button
        type="button"
        onClick={increaseFontSize}
        disabled={!canIncrease}
        aria-label="Zvětšit písmo přepisu"
        className={stepButtonClassName}
      >
        <span aria-hidden className="font-rounded text-[23px]/none font-semibold">
          A
        </span>
      </button>
    </div>
  );
}
