import type { ReactNode } from "react";
import { Text } from "./text";

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-two py-six text-center">
      {icon && (
        <span aria-hidden="true" className="text-text-muted">
          {icon}
        </span>
      )}
      <Text variant="subheading" as="p">
        {title}
      </Text>
      {description && (
        <Text variant="body" muted>
          {description}
        </Text>
      )}
      {action}
    </div>
  );
}
