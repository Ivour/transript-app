import type { ComponentPropsWithoutRef } from "react";
import { cn } from "../lib/cn";

/**
 * Rounded "pill" surface shared by the header and footer floating control
 * groups — white (dark: slate-900) background, subtle shadow and a thin
 * ring border. Purely presentational: it only owns the shared shape/
 * background, callers control layout (width, gap, justify, padding) via
 * `className`, matching the "hloupé" UI-only component convention (see
 * .clinerules section 10).
 */
export default function Pill({
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={cn(
        "flex items-center rounded-full bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
