import Link from "next/link";
import { Text } from "@/components/text";

export function Hero() {
  return (
    <section className="flex flex-col items-start gap-three p-six">
      <Text variant="display" as="h1">
        What are you drinking tonight?
      </Text>
      <Text variant="body" muted>
        Drink ideas from your pantry, recommendations, and popular drinks by region.
      </Text>
      <Link
        href="/search"
        className="inline-flex items-center justify-center gap-two rounded-medium bg-accent px-four py-two text-label font-medium text-accent-text transition-colors hover:opacity-90"
      >
        Search recipes
      </Link>
    </section>
  );
}
