import { MocktailsHiddenArea } from "@/mocktails/mocktails-hidden-area";

// Spec 0063 AC-12: the account page and reset password show the notice in
// mocktails only mode; the visitor stays a guest.
export default function AccountLayout({ children }: LayoutProps<"/[locale]/account">) {
  return <MocktailsHiddenArea>{children}</MocktailsHiddenArea>;
}
