import { Minus, Plus } from "lucide-react";
import { cn } from "../lib/cn";
import { useFontSize } from "../hooks/useFontSize";

/**
 * Thumb-friendly -/+ buttons that resize the transcript text (see
 * `useFontSize`). Styled to match `RecordButton`'s idle-state accent
 * color, so it reads as an intentional, tappable control rather than a
 * plain icon button. Deliberately self-contained: it owns the font size
 * state itself, so tapping -/+ only re-renders this control, not the rest
 * of `TranscribePage`/`TranscriptView` (see .clinerules section 10 and
 * `useFontSize` doc comment for the rationale).
 */
export default function FontSizeControl() {
  const { increaseFontSize, decreaseFontSize, canIncrease, canDecrease } =
    useFontSize();

  const filledButtonClassName = cn(
    "flex size-9 items-center justify-center rounded-full bg-slate-900 text-white shadow-sm transition active:scale-90",
    "hover:bg-slate-800",
    "disabled:pointer-events-none disabled:opacity-40",
    "dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200",
  );

  const outlinedButtonClassName = cn(
    "flex size-9 items-center justify-center rounded-full bg-transparent text-slate-900 ring-1 ring-slate-300 transition active:scale-90",
    "hover:bg-slate-100",
    "disabled:pointer-events-none disabled:opacity-40",
    "dark:text-slate-100 dark:ring-slate-600 dark:hover:bg-slate-800",
  );

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={decreaseFontSize}
        disabled={!canDecrease}
        aria-label="Zmenšit písmo přepisu"
        title="Zmenšit písmo přepisu"
        className={outlinedButtonClassName}
      >
        <Minus className="size-4" />
      </button>
      <button
        type="button"
        onClick={increaseFontSize}
        disabled={!canIncrease}
        aria-label="Zvětšit písmo přepisu"
        title="Zvětšit písmo přepisu"
        className={filledButtonClassName}
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}

