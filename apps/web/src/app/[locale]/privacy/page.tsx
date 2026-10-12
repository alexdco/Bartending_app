import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { localizedPath, type Locale } from "@bartendingapp/shared";
import { BackButton } from "@/components/back-button";
import { Text } from "@/components/text";
import { Card } from "@/components/card";

const EFFECTIVE_DATE = new Date("2026-09-07T00:00:00Z");
const CONTACT_EMAIL = "privacy@bartendingapp.example.com";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("privacy");

  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: { canonical: localizedPath((await getLocale()) as Locale, "/privacy") },
  };
}

export default async function PrivacyPage() {
  const t = await getTranslations("privacy");
  const format = await getFormatter();
  const effectiveDate = format.dateTime(EFFECTIVE_DATE, { dateStyle: "long", timeZone: "UTC" });

  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col gap-six px-six py-eight">
      <BackButton />
      <div className="flex flex-col gap-two">
        <Text variant="display">{t("title")}</Text>
        <Text variant="bodySmall" muted>
          {t("effectiveDate", { date: effectiveDate })}
        </Text>
      </div>

      <Card className="flex flex-col gap-two">
        <Text variant="subheading">{t("whatWeCollect")}</Text>
        <Text variant="body">{t("collectIntro")}</Text>
        <ul className="flex list-disc flex-col gap-two pl-six">
          <li>
            <Text variant="body" as="span">
              <strong>{t("accountDataTitle")}</strong> {t("accountDataBody")}
            </Text>
          </li>
          <li>
            <Text variant="body" as="span">
              <strong>{t("pantryDataTitle")}</strong> {t("pantryDataBody")}
            </Text>
          </li>
          <li>
            <Text variant="body" as="span">
              <strong>{t("guestDataTitle")}</strong> {t("guestDataBody")} {t("ageGateBody")}
            </Text>
          </li>
          <li>
            <Text variant="body" as="span">
              <strong>{t("aiDataTitle")}</strong> {t("aiDataBody")} {t("aiIpHashBody")}
            </Text>
          </li>
          <li>
            <Text variant="body" as="span">
              <strong>{t("analyticsDataTitle")}</strong> {t("analyticsDataBody")}
            </Text>
          </li>
          <li>
            <Text variant="body" as="span">
              <strong>{t("diagnosticDataTitle")}</strong> {t("diagnosticDataBody")}
            </Text>
          </li>
        </ul>
      </Card>

      <Card className="flex flex-col gap-two">
        <Text variant="subheading">{t("deletingYourData")}</Text>
        <Text variant="body">{t("deletingYourDataBody")}</Text>
      </Card>

      <Card className="flex flex-col gap-two">
        <Text variant="subheading">{t("contact")}</Text>
        <Text variant="body">
          {t.rich("contactBody", {
            email: () => (
              <a href={`mailto:${CONTACT_EMAIL}`} className="underline">
                {CONTACT_EMAIL}
              </a>
            ),
          })}
        </Text>
      </Card>
    </main>
  );
}
