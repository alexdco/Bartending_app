import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Text } from "./text";

export function SiteFooter() {
  const t = useTranslations("footer");

  return (
    <footer className="flex flex-wrap items-center justify-between gap-four border-t border-border px-six py-three">
      <Link href="/privacy">
        <Text variant="label" as="span" muted>
          {t("privacyPolicy")}
        </Text>
      </Link>
      <Text variant="label" as="p" muted>
        {t("responsibleDrinking")}
      </Text>
    </footer>
  );
}
