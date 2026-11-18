import { ToggleGroup } from "radix-ui";

export interface SegmentedControlOption<Value extends string> {
  value: Value;
  label: string;
}

export interface SegmentedControlProps<Value extends string> {
  /** Accessible name of the radio group. */
  label: string;
  options: readonly SegmentedControlOption<Value>[];
  value: Value;
  onValueChange: (value: Value) => void;
}

/**
 * A two or three way choice where exactly one option is always selected
 * (spec 0061 AC-1, AC-12). Radix ToggleGroup in single mode renders a
 * radiogroup of radios with aria-checked and arrow key navigation.
 */
export function SegmentedControl<Value extends string>({
  label,
  options,
  value,
  onValueChange,
}: SegmentedControlProps<Value>) {
  return (
    <ToggleGroup.Root
      type="single"
      aria-label={label}
      value={value}
      onValueChange={(next) => {
        // Radix emits "" when the selected item is pressed again; keep it selected.
        const option = options.find((candidate) => candidate.value === next);
        if (option && option.value !== value) {
          onValueChange(option.value);
        }
      }}
      className="inline-flex w-fit rounded-full border border-border bg-surface p-half"
    >
      {options.map((option) => (
        <ToggleGroup.Item
          key={option.value}
          value={option.value}
          className="inline-flex min-h-11 items-center rounded-full px-three text-label text-text transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus data-[state=on]:bg-accent data-[state=on]:text-accent-text"
        >
          {option.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
