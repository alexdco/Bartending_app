import Link from "next/link";
import { LEARN_CATEGORIES } from "@bartendingapp/shared";
import { BackButton } from "@/components/back-button";
import { Card } from "@/components/card";
import { Text } from "@/components/text";

const CATEGORY_LABELS: Record<(typeof LEARN_CATEGORIES)[number], string> = {
  tools: "Tools",
  spirits: "Spirits",
  wine: "Wine",
  beer: "Beer",
  other: "Other",
};

export default function LearnPage() {
  return (
    <div className="flex flex-col gap-four p-six">
      <BackButton />
      <Text variant="display" as="h1">
        Learn
      </Text>
      <Text variant="body" muted>
        Short articles about bar tools, spirits, wine, and beer.
      </Text>

      <div className="grid grid-cols-2 gap-three sm:grid-cols-3">
        {LEARN_CATEGORIES.map((category) => (
          <Link key={category} href={`/learn/${category}`}>
            <Card>
              <Text variant="subheading" as="h2">
                {CATEGORY_LABELS[category]}
              </Text>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
