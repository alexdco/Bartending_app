"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog, DropdownMenu, VisuallyHidden } from "radix-ui";
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

function HamburgerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3 6h18v2H3V6Zm0 5h18v2H3v-2Zm0 5h18v2H3v-2Z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6.4 4.99 4.99 6.4 10.59 12l-5.6 5.6 1.41 1.41L12 13.41l5.6 5.6 1.41-1.41-5.6-5.6 5.6-5.6-1.41-1.41L12 10.59l-5.6-5.6Z" />
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

function DrawerAccountSection({ onNavigate }: { onNavigate: () => void }) {
  const { session, isLinked, isLoading } = useSession();
  const { data: profile } = useProfile();
  const signOut = useSignOut();
  const { preference, setTheme } = useTheme();
  const [themeExpanded, setThemeExpanded] = useState(false);

  if (isLoading) {
    return null;
  }

  if (!isLinked) {
    return (
      <Link
        href="/account"
        onClick={onNavigate}
        className="block rounded-medium px-three py-two hover:bg-surface-selected"
      >
        <Text variant="label" as="span">
          Sign in
        </Text>
      </Link>
    );
  }

  const initials = getInitials(profile?.displayName ?? null, session?.user.email ?? null);

  return (
    <div className="flex flex-col gap-two">
      <div className="flex items-center gap-three px-three py-two">
        <span
          className="flex items-center justify-center rounded-full bg-accent text-accent-text"
          style={{ width: avatarSize.web, height: avatarSize.web }}
        >
          <Text variant="label" as="span" className="text-accent-text">
            {initials}
          </Text>
        </span>
      </div>
      <Link
        href="/account"
        onClick={onNavigate}
        className="block rounded-medium px-three py-two hover:bg-surface-selected"
      >
        <Text variant="label" as="span">
          Account
        </Text>
      </Link>
      <div>
        <button
          type="button"
          onClick={() => setThemeExpanded((expanded) => !expanded)}
          aria-expanded={themeExpanded}
          className="flex w-full items-center justify-between rounded-medium px-three py-two hover:bg-surface-selected"
        >
          <Text variant="label" as="span">
            Theme
          </Text>
          <Text variant="label" as="span" className="text-text-muted">
            {themeOptions.find((option) => option.value === preference)?.label}
          </Text>
        </button>
        {themeExpanded ? (
          <div className="flex flex-col gap-one pl-three">
            {themeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setTheme(option.value)}
                className={
                  option.value === preference
                    ? "block rounded-medium bg-surface-selected px-three py-two text-left"
                    : "block rounded-medium px-three py-two text-left hover:bg-surface-selected"
                }
              >
                <Text variant="label" as="span">
                  {option.label}
                </Text>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => signOut.mutate()}
        className="block rounded-medium px-three py-two text-left hover:bg-surface-selected"
      >
        <Text variant="label" as="span">
          Sign out
        </Text>
      </button>
    </div>
  );
}

function MobileNavDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const pathname = usePathname();

  useEffect(() => {
    onOpenChange(false);
  }, [pathname, onOpenChange]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 768px)");
    const handleChange = (event: MediaQueryListEvent) => {
      if (event.matches) {
        onOpenChange(false);
      }
    };
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [onOpenChange]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label={open ? "Close navigation" : "Open navigation"}
          className="flex md:hidden items-center justify-center rounded-medium p-two"
        >
          {open ? <CloseIcon /> : <HamburgerIcon />}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="drawer-overlay fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="drawer-content fixed inset-y-0 right-0 z-50 flex w-[min(320px,85vw)] flex-col overflow-y-auto rounded-l-large border-l border-border bg-surface p-four">
          <VisuallyHidden.Root asChild>
            <Dialog.Title>Navigation</Dialog.Title>
          </VisuallyHidden.Root>
          <div className="flex flex-col gap-one">
            {navLinks.map(({ href, label }) => {
              const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);

              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => onOpenChange(false)}
                  className={
                    isActive
                      ? "block rounded-medium bg-accent px-three py-two text-accent-text"
                      : "block rounded-medium px-three py-two hover:bg-surface-selected"
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
          <div className="my-three h-px bg-border" />
          <DrawerAccountSection onNavigate={() => onOpenChange(false)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function SiteNav() {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <nav className="flex items-center justify-between border-b border-border px-six py-three">
      <div className="flex items-center gap-five">
        <SiteLogo />
        <div className="hidden md:flex items-center gap-four">
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
      <div className="hidden md:block">
        <NavBadge />
      </div>
      <MobileNavDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
    </nav>
  );
}
