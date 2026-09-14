import type { Metadata } from "next";
import { Text } from "@/components/text";
import { Card } from "@/components/card";

const EFFECTIVE_DATE = "September 7, 2026";
const CONTACT_EMAIL = "privacy@bartendingapp.example.com";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What Bartending App collects, why, and how to request it be deleted.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col gap-six px-six py-eight">
      <div className="flex flex-col gap-two">
        <Text variant="display">Privacy Policy</Text>
        <Text variant="bodySmall" muted>
          Effective date: {EFFECTIVE_DATE}
        </Text>
      </div>

      <Card className="flex flex-col gap-two">
        <Text variant="subheading">What we collect</Text>
        <Text variant="body">Bartending App collects the following categories of data:</Text>
        <ul className="flex list-disc flex-col gap-two pl-six">
          <li>
            <Text variant="body" as="span">
              <strong>Account and authentication data.</strong> If you create an account, we store
              the email and credentials Supabase (our authentication provider) needs to sign you in.
            </Text>
          </li>
          <li>
            <Text variant="body" as="span">
              <strong>Pantry and favorites data.</strong> The ingredients you add to your pantry and
              the recipes you favorite, so we can show them back to you.
            </Text>
          </li>
          <li>
            <Text variant="body" as="span">
              <strong>Anonymous guest session data.</strong> If you use the app without signing in,
              we create an anonymous session so your pantry and favorites still work and persist on
              your device.
            </Text>
          </li>
          <li>
            <Text variant="body" as="span">
              <strong>AI generated drink idea data.</strong> When you ask for a drink idea from your
              pantry, your pantry contents and prompt are sent to Anthropic, our AI provider, to
              generate a suggestion.
            </Text>
          </li>
          <li>
            <Text variant="body" as="span">
              <strong>Product analytics.</strong> On web, once you accept the cookie notice, and on
              the mobile app, we send PostHog, our analytics provider, events for actions like
              searching, adding a pantry item, and generating a drink idea, tied to your guest or
              signed in identity. A search event includes the text of your search query. We do not
              track page views, clicks, or session recordings.
            </Text>
          </li>
          <li>
            <Text variant="body" as="span">
              <strong>Error and diagnostic logging (planned, not yet collected).</strong> We intend
              to install error tracking (Sentry) to help us find and fix bugs. Once installed, this
              may include your IP address and device or browser information. This category is not
              collected today; this notice will be updated when it is.
            </Text>
          </li>
        </ul>
      </Card>

      <Card className="flex flex-col gap-two">
        <Text variant="subheading">Deleting your data</Text>
        <Text variant="body">
          If you have an account, you can delete it and its associated data at any time from the
          Account screen&apos;s delete account option.
        </Text>
      </Card>

      <Card className="flex flex-col gap-two">
        <Text variant="subheading">Contact</Text>
        <Text variant="body">
          Questions about this policy or your data can be sent to{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="underline">
            {CONTACT_EMAIL}
          </a>
          .
        </Text>
      </Card>
    </main>
  );
}
