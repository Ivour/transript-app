import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge only knows Tailwind's default theme. Custom font sizes
 * from `src/styles/theme.css` must be registered, otherwise e.g.
 * `text-callout` is taken for a text *color* and silently removes
 * `text-primary-foreground`. Keep in sync with the `--text-*` entries there.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["wordmark", "empty-title", "callout", "footnote"],
    },
  },
});

/**
 * Combines conditional class names (clsx) and resolves conflicting
 * Tailwind utility classes (tailwind-merge).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
