"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DropdownMenu } from "radix-ui";
import { avatarSize, getInitials } from "@bartendingapp/shared";
import { Text } from "./text";
import { SiteLogo } from "./site-logo";
import { useSession } from "@/auth/use-session";
import { useProfile } from "@/auth/use-preferences";
import { useSignOut } from "@/auth/use-auth-mutations";
import { useTheme, type ThemePreference } from "@/theme/use-theme";

function PersonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.4 0-8 2.2-8 5v1a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1c0-2.8-3.6-5-8-5Z" />
    </svg>
  );
}

const themeOptions: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

function NavBadge() {
  const { session, isLinked, isLoading } = useSession();
  const { data: profile } = useProfile();
  const signOut = useSignOut();
  const { preference, setTheme } = useTheme();

  if (isLoading) {
    return null;
  }

  if (!isLinked) {
    return (
      <Link href="/account" aria-label="Sign in">
        <span
          className="flex items-center justify-center rounded-full bg-surface-selected text-text-muted"
          style={{ width: avatarSize.web, height: avatarSize.web }}
        >
          <PersonIcon />
        </span>
      </Link>
    );
  }

  const initials = getInitials(profile?.displayName ?? null, session?.user.email ?? null);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button type="button" aria-label="Account menu" className="rounded-full">
          <span
            className="flex items-center justify-center rounded-full bg-accent text-accent-text"
            style={{ width: avatarSize.web, height: avatarSize.web }}
          >
            <Text variant="label" as="span" className="text-accent-text">
              {initials}
            </Text>
          </span>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="min-w-40 rounded-medium border border-border bg-surface py-two shadow-lg"
        >
          <DropdownMenu.Item asChild>
            <Link
              href="/account"
              className="block px-four py-two text-label outline-none hover:bg-surface-selected"
            >
              <Text variant="label" as="span">
                Account
              </Text>
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-two h-px bg-border" />
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger className="flex cursor-pointer items-center justify-between px-four py-two text-label outline-none hover:bg-surface-selected data-[state=open]:bg-surface-selected">
              <Text variant="label" as="span">
                Theme
              </Text>
              <Text variant="label" as="span" className="text-text-muted">
                {themeOptions.find((option) => option.value === preference)?.label}
              </Text>
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent
                sideOffset={4}
                alignOffset={-4}
                className="min-w-32 rounded-medium border border-border bg-surface py-two shadow-lg"
              >
                <DropdownMenu.RadioGroup
                  value={preference}
                  onValueChange={(value) => setTheme(value as ThemePreference)}
                >
                  {themeOptions.map((option) => (
                    <DropdownMenu.RadioItem
                      key={option.value}
                      value={option.value}
                      className="block cursor-pointer px-four py-two text-label outline-none hover:bg-surface-selected data-[state=checked]:bg-surface-selected"
                    >
                      <Text variant="label" as="span">
                        {option.label}
                      </Text>
                    </DropdownMenu.RadioItem>
                  ))}
                </DropdownMenu.RadioGroup>
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>
          <DropdownMenu.Separator className="my-two h-px bg-border" />
          <DropdownMenu.Item
            className="block cursor-pointer px-four py-two text-label outline-none hover:bg-surface-selected"
            onSelect={() => signOut.mutate()}
          >
            <Text variant="label" as="span">
              Sign out
            </Text>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/search", label: "Search" },
  { href: "/pantry", label: "Pantry" },
  { href: "/drink-ideas", label: "Drink ideas" },
  { href: "/popular", label: "Popular" },
  { href: "/favorites", label: "Favorites" },
];

export function SiteNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center justify-between border-b border-border px-six py-three">
      <div className="flex items-center gap-five">
        <SiteLogo />
        <div className="flex items-center gap-four">
          {navLinks.map(({ href, label }) => {
            const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);

            return (
              <Link
                key={href}
                href={href}
                className={
                  isActive
                    ? "rounded-medium bg-accent px-three py-one text-accent-text"
                    : "rounded-medium px-three py-one"
                }
              >
                <Text
                  variant="label"
                  as="span"
                  className={isActive ? "text-accent-text" : undefined}
                >
                  {label}
                </Text>
              </Link>
            );
          })}
        </div>
      </div>
      <NavBadge />
    </nav>
  );
}
