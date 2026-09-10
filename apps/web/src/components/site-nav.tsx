"use client";

import Link from "next/link";
import { avatarSize, getInitials } from "@bartendingapp/shared";
import { Text } from "./text";
import { useSession } from "@/auth/use-session";
import { useProfile } from "@/auth/use-preferences";

function NavBadge() {
  const { session, isLinked, isLoading } = useSession();
  const { data: profile } = useProfile();

  if (isLoading) {
    return null;
  }

  if (!isLinked) {
    return (
      <Link href="/account" aria-label="Account (signed out)">
        <span
          className="flex items-center justify-center rounded-full bg-surface-selected text-text-muted"
          style={{ width: avatarSize.web, height: avatarSize.web }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.4 0-8 2.2-8 5v1a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1c0-2.8-3.6-5-8-5Z" />
          </svg>
        </span>
      </Link>
    );
  }

  const initials = getInitials(profile?.displayName ?? null, session?.user.email ?? null);

  return (
    <Link href="/account" aria-label="Account">
      <span
        className="flex items-center justify-center rounded-full bg-accent text-accent-text"
        style={{ width: avatarSize.web, height: avatarSize.web }}
      >
        <Text variant="label" as="span" className="text-accent-text">
          {initials}
        </Text>
      </span>
    </Link>
  );
}

export function SiteNav() {
  return (
    <nav className="flex items-center justify-between border-b border-border px-six py-three">
      <div className="flex items-center gap-four">
        <Link href="/">
          <Text variant="label" as="span">
            Home
          </Text>
        </Link>
        <Link href="/search">
          <Text variant="label" as="span">
            Search
          </Text>
        </Link>
        <Link href="/pantry">
          <Text variant="label" as="span">
            Pantry
          </Text>
        </Link>
        <Link href="/drink-ideas">
          <Text variant="label" as="span">
            Drink ideas
          </Text>
        </Link>
        <Link href="/popular">
          <Text variant="label" as="span">
            Popular
          </Text>
        </Link>
        <Link href="/favorites">
          <Text variant="label" as="span">
            Favorites
          </Text>
        </Link>
        <Link href="/account">
          <Text variant="label" as="span">
            Account
          </Text>
        </Link>
      </div>
      <NavBadge />
    </nav>
  );
}
