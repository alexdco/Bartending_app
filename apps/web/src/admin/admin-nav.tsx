import { Link } from "@/i18n/navigation";
import { Text } from "@/components/text";

const adminLinks = [
  { href: "/admin/comments", label: "Comments" },
  { href: "/admin/recipes", label: "Recipes" },
] as const;

export function AdminNav() {
  return (
    <nav className="flex gap-four border-b border-border pb-three">
      {adminLinks.map((link) => (
        <Link key={link.href} href={link.href} className="underline-offset-4 hover:underline">
          <Text variant="label" as="span">
            {link.label}
          </Text>
        </Link>
      ))}
    </nav>
  );
}
