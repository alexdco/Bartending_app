import { Text } from "@/components/text";

export interface FlavorProfileSectionProps {
  heading: string;
  flavors: readonly string[];
}

/**
 * The recipe's taste tags as read only pills. A list, not Chips: Chip is a
 * toggle button, and these labels aren't interactive. Renders nothing until
 * the recipe has been classified.
 */
export function FlavorProfileSection({ heading, flavors }: FlavorProfileSectionProps) {
  if (flavors.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-col gap-two">
      <Text variant="heading" as="h2">
        {heading}
      </Text>
      <ul className="flex flex-wrap gap-two">
        {flavors.map((flavor) => (
          <li
            key={flavor}
            className="inline-flex items-center rounded-full border border-border bg-surface px-three py-one text-label text-text capitalize"
          >
            {flavor}
          </li>
        ))}
      </ul>
    </section>
  );
}
