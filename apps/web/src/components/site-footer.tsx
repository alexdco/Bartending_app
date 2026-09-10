import Link from "next/link";
import { Text } from "./text";

export function SiteFooter() {
  return (
    <footer className="flex items-center gap-four border-t border-border px-six py-three">
      <Link href="/privacy">
        <Text variant="label" as="span" muted>
          Privacy Policy
        </Text>
      </Link>
    </footer>
  );
}
