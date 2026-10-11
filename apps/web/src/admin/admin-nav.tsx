import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Text } from "@/components/text";

const adminLinks = [
  { href: "/admin/comments", key: "comments" },
  { href: "/admin/recipes", key: "recipes" },
] as const;

export function AdminNav() {
  const t = useTranslations("admin");

  return (
    <nav className="flex gap-four border-b border-border pb-three">
      {adminLinks.map((link) => (
        <Link key={link.href} href={link.href} className="underline-offset-4 hover:underline">
          <Text variant="label" as="span">
            {t(link.key)}
          </Text>
        </Link>
      ))}
    </nav>
  );
}
