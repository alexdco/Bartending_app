import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { LEARN_CATEGORIES } from "@bartendingapp/shared";
import { BackButton } from "@/components/back-button";
import { Card } from "@/components/card";
import { Text } from "@/components/text";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("learn");
  return { title: t("title"), description: t("metaDescription") };
}

export default function LearnPage() {
  const t = useTranslations("learn");

  return (
    <main className="flex flex-1 flex-col gap-four p-six">
      <BackButton />
      <Text variant="display" as="h1">
        {t("title")}
      </Text>
      <Text variant="body" muted>
        {t("intro")}
      </Text>

      <div className="grid grid-cols-2 gap-three sm:grid-cols-3">
        {LEARN_CATEGORIES.map((category) => (
          <Link key={category} href={`/learn/${category}`}>
            <Card>
              <Text variant="subheading" as="h2">
                {t(`categories.${category}`)}
              </Text>
            </Card>
          </Link>
        ))}
      </div>

      <Link href="/quizzes">
        <Card className="border-accent">
          <Text variant="label">{t("takeAQuiz")}</Text>
        </Card>
      </Link>
    </main>
  );
}
