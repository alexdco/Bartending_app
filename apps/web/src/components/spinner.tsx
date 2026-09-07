export interface SpinnerProps {
  label?: string;
}

export function Spinner({ label = "Loading" }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className="inline-block size-6 animate-spin rounded-full border-2 border-border border-t-accent"
    />
  );
}
