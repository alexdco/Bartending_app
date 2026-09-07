import Link from "next/link";
import { Text } from "./text";

export function SiteNav() {
  return (
    <nav className="flex items-center gap-four border-b border-border px-six py-three">
      <Link href="/">
        <Text variant="label" as="span">
          Recipes
        </Text>
      </Link>
      <Link href="/pantry">
        <Text variant="label" as="span">
          Pantry
        </Text>
      </Link>
    </nav>
  );
}
