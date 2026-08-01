/* eslint-disable react-refresh/only-export-components */
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-sm border px-2 py-0.5 font-display text-[11px] font-bold tracking-wide uppercase transition-colors select-none",
  {
    variants: {
      variant: {
        default:
          "border-border bg-primary text-primary-foreground",
        secondary:
          "border-border bg-secondary text-secondary-foreground",
        outline: "border-border text-foreground",
        // Vintage "reel label" speaker palette — mustard, olive, rust, teal, plum, ochre.
        mustard: "border-[oklch(0.4_0.1_75)] bg-[oklch(0.66_0.14_75)] text-[oklch(0.2_0.04_75)]",
        olive: "border-[oklch(0.32_0.06_130)] bg-[oklch(0.55_0.1_130)] text-[oklch(0.95_0.02_130)]",
        rust: "border-[oklch(0.3_0.1_30)] bg-[oklch(0.5_0.15_30)] text-[oklch(0.96_0.01_30)]",
        teal: "border-[oklch(0.3_0.05_195)] bg-[oklch(0.5_0.08_195)] text-[oklch(0.96_0.01_195)]",
        plum: "border-[oklch(0.28_0.07_330)] bg-[oklch(0.45_0.11_330)] text-[oklch(0.96_0.01_330)]",
        ochre: "border-[oklch(0.36_0.08_60)] bg-[oklch(0.6_0.12_60)] text-[oklch(0.2_0.03_60)]",
        slate: "border-border bg-muted text-muted-foreground",
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
