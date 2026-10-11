"use client";

import { useTranslations } from "next-intl";

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
  const t = useTranslations("favorites");

  return (
    <button
      type="button"
      aria-pressed={isFavorited}
      aria-label={isFavorited ? t("remove") : t("add")}
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
