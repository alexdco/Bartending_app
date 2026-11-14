import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LEARN_CATEGORIES } from "@bartendingapp/shared";
import type { Locale } from "@bartendingapp/shared";
import { BackButton } from "@/components/back-button";
import { Card } from "@/components/card";
import { Text } from "@/components/text";

// Spec 0053: prebuilt per locale (the layout's generateStaticParams), then
// rebuilt at most every 60 seconds, the same mode as every Learn route. Must
// stay a literal. Nothing on this page may read cookies or headers.
export const revalidate = 60;

interface LearnLandingParams {
  locale: string;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<LearnLandingParams>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "learn" });
  return { title: t("landingTitle"), description: t("landingDescription") };
}

export default async function LearnPage({ params }: { params: Promise<LearnLandingParams> }) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations("learn");

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
