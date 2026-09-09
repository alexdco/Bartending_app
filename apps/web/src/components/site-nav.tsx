import Link from "next/link";
import { Text } from "./text";

export function SiteNav() {
  return (
    <nav className="flex items-center gap-four border-b border-border px-six py-three">
      <Link href="/">
        <Text variant="label" as="span">
          Home
        </Text>
      </Link>
      <Link href="/search">
        <Text variant="label" as="span">
          Search
        </Text>
      </Link>
      <Link href="/pantry">
        <Text variant="label" as="span">
          Pantry
        </Text>
      </Link>
      <Link href="/drink-ideas">
        <Text variant="label" as="span">
          Drink ideas
        </Text>
      </Link>
      <Link href="/popular">
        <Text variant="label" as="span">
          Popular
        </Text>
      </Link>
      <Link href="/favorites">
        <Text variant="label" as="span">
          Favorites
        </Text>
      </Link>
      <Link href="/account">
        <Text variant="label" as="span">
          Account
        </Text>
      </Link>
    </nav>
  );
}
