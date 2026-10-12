"use client";

import { useTranslations } from "next-intl";
import { DropdownMenu } from "radix-ui";
import { Link, usePathname } from "@/i18n/navigation";
import { Text } from "@/components/text";

function ChevronDownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const views = [
  { href: "/pantry", key: "pantry" },
  { href: "/shopping-list", key: "shoppingList" },
] as const;

export function PantryShoppingSwitcher() {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const current = views.find((view) => pathname.startsWith(view.href)) ?? views[0];

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="flex items-center gap-one rounded-medium px-two py-one text-text-muted hover:bg-surface-selected"
        >
          <Text variant="bodySmall" as="span">
            {t(current.key)}
          </Text>
          <ChevronDownIcon />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={4}
          className="min-w-40 rounded-medium border border-border bg-surface py-two shadow-lg"
        >
          {views.map((view) => (
            <DropdownMenu.Item key={view.href} asChild>
              <Link
                href={view.href}
                className={
                  view.href === current.href
                    ? "block px-four py-two text-label outline-none data-[highlighted]:bg-surface-selected focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus bg-surface-selected"
                    : "block px-four py-two text-label outline-none data-[highlighted]:bg-surface-selected focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus hover:bg-surface-selected"
                }
              >
                <Text variant="label" as="span">
                  {t(view.key)}
                </Text>
              </Link>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
