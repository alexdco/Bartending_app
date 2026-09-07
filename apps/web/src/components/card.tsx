import type { HTMLAttributes, ReactNode } from "react";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  selected?: boolean;
}

export function Card({ children, selected = false, className = "", ...rest }: CardProps) {
  const background = selected ? "bg-surface-selected" : "bg-surface";
  return (
    <div
      className={`${background} rounded-medium border border-border p-four ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
