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
        sky: "bg-sky-50 text-sky-700 ring-sky-600/10",
        emerald: "bg-emerald-50 text-emerald-700 ring-emerald-600/10",
        amber: "bg-amber-50 text-amber-700 ring-amber-600/10",
        fuchsia: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-600/10",
        rose: "bg-rose-50 text-rose-700 ring-rose-600/10",
        indigo: "bg-indigo-50 text-indigo-700 ring-indigo-600/10",
        slate: "bg-slate-50 text-slate-700 ring-slate-600/10",
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
