import Link from "next/link";
import { Text } from "./text";

export function SiteLogo() {
  return (
    <Link href="/" aria-label="Cocktailist home" className="flex items-center gap-two">
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className="text-accent"
      >
        <path
          d="M4 4h16l-6.5 8.5V18h3a1 1 0 0 1 0 2H7.5a1 1 0 0 1 0-2h3v-5.5L4 4Z"
          fill="currentColor"
        />
        <path d="M7.5 6h9" stroke="var(--color-bg)" strokeWidth="1.25" strokeLinecap="round" />
      </svg>
      <Text variant="subheading" as="span" className="font-display tracking-tight">
        Cocktailist
      </Text>
    </Link>
  );
}
