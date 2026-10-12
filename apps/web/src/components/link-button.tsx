import type { ComponentProps } from "react";
import { Link } from "@/i18n/navigation";

// A locale aware link that looks like the primary Button, for empty state
// actions that navigate (e.g. "Browse all recipes", spec 0038).
export function LinkButton({ className = "", ...rest }: ComponentProps<typeof Link>) {
  return (
    <Link
      className={`inline-flex items-center justify-center gap-two rounded-medium bg-accent px-four py-two text-label font-medium text-accent-text transition-colors hover:opacity-90 ${className}`}
      {...rest}
    />
  );
}
