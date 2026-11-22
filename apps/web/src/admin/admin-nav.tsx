import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Text } from "@/components/text";
import { AdminReviewBadge } from "./admin-review-badge";

const adminLinks = [
  { href: "/admin/comments", key: "comments" },
  { href: "/admin/recipes", key: "recipes" },
  { href: "/admin/ingredients", key: "ingredients" },
  { href: "/admin/submissions", key: "submissions" },
] as const;

export function AdminNav() {
  const t = useTranslations("admin");

  return (
    <nav className="flex gap-four border-b border-border pb-three">
      {adminLinks.map((link) => (
        <span key={link.href} className="flex items-center gap-one">
          <Link href={link.href} className="underline-offset-4 hover:underline">
            <Text variant="label" as="span">
              {t(link.key)}
            </Text>
          </Link>
          {link.key === "comments" && <AdminReviewBadge />}
        </span>
      ))}
    </nav>
  );
}
