import { Link } from "react-router";
import { BarChart2, LogOut } from "lucide-react";
import LivelifeMark from "./LivelifeMark";

interface AppHeaderProps {
  onSignOut: () => void;
}

const iconButtonClassName =
  "grid size-11 place-items-center rounded-full text-ink focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-focus";

/**
 * Floating header over the transcript: brand pill on the left, usage /
 * sign-out pill on the right. Absolutely positioned so cards scroll under
 * the frosted fade (`ll-header-fade`).
 */
export default function AppHeader({ onSignOut }: AppHeaderProps) {
  return (
    <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4 pt-(--safe-top) pb-3">
      <div className="ll-header-fade" />
      <div className="glass flex h-11 items-center gap-2 rounded-full pr-4 pl-3">
        <LivelifeMark className="h-5.5 w-7.5 flex-none text-brand-ink" />
        <span className="font-rounded text-wordmark text-ink">livelife</span>
      </div>
      <div
        className="glass flex h-11 items-center rounded-full px-0.5"
        role="toolbar"
      >
        <Link
          to="/usage"
          aria-label="Historie a statistiky využití"
          title="Statistiky využití"
          className={iconButtonClassName}
        >
          <BarChart2 className="size-5.5" strokeWidth={2.4} />
        </Link>
        <span className="h-5 w-px bg-hairline" />
        <button
          type="button"
          onClick={onSignOut}
          aria-label="Odhlásit se"
          title="Odhlásit se"
          className={iconButtonClassName}
        >
          <LogOut className="size-5.5" />
        </button>
      </div>
    </header>
  );
}
