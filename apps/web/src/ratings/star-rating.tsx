"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

export interface StarRatingProps {
  value: number;
  onRate?: (score: 1 | 2 | 3 | 4 | 5) => void;
  disabled?: boolean;
  size?: "small" | "large";
  /** Display mode only: the one sentence the stars are announced as (spec 0038 AC-7). */
  label?: string;
}

const SCORES = [1, 2, 3, 4, 5] as const;

export function StarRating({
  value,
  onRate,
  disabled = false,
  size = "large",
  label,
}: StarRatingProps) {
  const t = useTranslations("ratings");
  const [hovered, setHovered] = useState<number | null>(null);
  const interactive = Boolean(onRate) && !disabled;
  const displayValue = hovered ?? value;
  const starSize = size === "large" ? "text-2xl" : "text-base";

  return (
    <div
      role={interactive ? "radiogroup" : "img"}
      aria-label={interactive ? t("rating") : (label ?? t("rating"))}
      className="flex items-center gap-one"
      onMouseLeave={() => setHovered(null)}
    >
      {SCORES.map((score) => {
        const filled = score <= displayValue;

        if (!interactive) {
          return (
            <span key={score} aria-hidden="true" className={`${starSize} leading-none`}>
              <span className={filled ? "text-accent" : "text-text/30"}>★</span>
            </span>
          );
        }

        return (
          <button
            key={score}
            type="button"
            role="radio"
            aria-checked={score === value}
            aria-label={t("rateStars", { count: score })}
            disabled={disabled}
            onMouseEnter={() => setHovered(score)}
            onFocus={() => setHovered(score)}
            onBlur={() => setHovered(null)}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onRate?.(score);
            }}
            className={`${starSize} leading-none transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              filled ? "text-accent" : "text-text/30"
            }`}
          >
            ★
          </button>
        );
      })}
    </div>
  );
}
