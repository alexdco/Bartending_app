import type { ElementType, HTMLAttributes, ReactNode } from "react";

type Variant = "display" | "heading" | "subheading" | "body" | "bodySmall" | "label";

export interface TextProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
  variant?: Variant;
  as?: ElementType;
  muted?: boolean;
}

const variantClass: Record<Variant, string> = {
  display: "text-display leading-display font-display font-semibold",
  heading: "text-heading leading-heading font-display font-semibold",
  subheading: "text-subheading leading-subheading font-display font-medium",
  body: "text-body leading-body font-body",
  bodySmall: "text-body-small leading-body-small font-body",
  label: "text-label leading-label font-body font-medium",
};

const defaultTag: Record<Variant, ElementType> = {
  display: "h1",
  heading: "h2",
  subheading: "h3",
  body: "p",
  bodySmall: "p",
  label: "span",
};

export function Text({
  children,
  variant = "body",
  as,
  muted = false,
  className = "",
  ...rest
}: TextProps) {
  const Tag = as ?? defaultTag[variant];
  const color = muted ? "text-text-muted" : "text-text";
  return (
    <Tag className={`${variantClass[variant]} ${color} ${className}`} {...rest}>
      {children}
    </Tag>
  );
}
