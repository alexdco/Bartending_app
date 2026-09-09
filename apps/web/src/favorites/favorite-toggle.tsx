"use client";

export interface FavoriteToggleProps {
  isFavorited: boolean;
  onToggle: () => void;
  disabled?: boolean;
  className?: string;
}

export function FavoriteToggle({
  isFavorited,
  onToggle,
  disabled,
  className = "",
}: FavoriteToggleProps) {
  return (
    <button
      type="button"
      aria-pressed={isFavorited}
      aria-label={isFavorited ? "Remove from favorites" : "Add to favorites"}
      disabled={disabled}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onToggle();
      }}
      className={`flex h-11 w-11 items-center justify-center rounded-full bg-surface/90 text-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        isFavorited ? "text-danger" : "text-text"
      } ${className}`}
    >
      <span aria-hidden="true">{isFavorited ? "♥" : "♡"}</span>
    </button>
  );
}
