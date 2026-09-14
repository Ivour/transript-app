/* eslint-disable react-refresh/only-export-components */
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ring-1 transition-colors select-none",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary/80 ring-transparent",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 ring-transparent",
        outline: "text-foreground border-border",
        sky: "bg-sky-50 text-sky-700 ring-sky-600/10 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-400/20",
        emerald:
          "bg-emerald-50 text-emerald-700 ring-emerald-600/10 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/20",
        amber:
          "bg-amber-50 text-amber-700 ring-amber-600/10 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/20",
        fuchsia:
          "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-600/10 dark:bg-fuchsia-500/15 dark:text-fuchsia-300 dark:ring-fuchsia-400/20",
        rose: "bg-rose-50 text-rose-700 ring-rose-600/10 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-400/20",
        indigo:
          "bg-indigo-50 text-indigo-700 ring-indigo-600/10 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-400/20",
        slate:
          "bg-slate-50 text-slate-700 ring-slate-600/10 dark:bg-slate-500/15 dark:text-slate-300 dark:ring-slate-400/20",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
