import { Toggle } from "radix-ui";
import type { ReactNode } from "react";

export interface ChipProps {
  children: ReactNode;
  selected?: boolean;
  onSelectedChange?: (selected: boolean) => void;
  disabled?: boolean;
}

export function Chip({ children, selected = false, onSelectedChange, disabled }: ChipProps) {
  return (
    <Toggle.Root
      pressed={selected}
      onPressedChange={onSelectedChange}
      disabled={disabled}
      className="inline-flex items-center rounded-full border border-border bg-surface px-three py-one text-label text-text transition-colors data-[state=on]:bg-accent data-[state=on]:text-accent-text data-[state=on]:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {children}
    </Toggle.Root>
  );
}
