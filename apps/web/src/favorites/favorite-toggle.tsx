"use client";

import { useTranslations } from "next-intl";

export interface FavoriteToggleProps {
  /** Names the control: "Favorite {name}" (spec 0038 AC-10). */
  recipeName: string;
  isFavorited: boolean;
  onToggle: () => void;
  disabled?: boolean;
  className?: string;
}

export function FavoriteToggle({
  recipeName,
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
      // Fixed name; the on/off state lives only in aria-pressed (spec 0038 AC-10).
      aria-label={t("toggleLabel", { name: recipeName })}
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
