import { MocktailsHiddenArea } from "@/mocktails/mocktails-hidden-area";

// Spec 0063 AC-12: every admin route shows the notice in mocktails only mode.
export default function AdminLayout({ children }: LayoutProps<"/[locale]/admin">) {
  return <MocktailsHiddenArea>{children}</MocktailsHiddenArea>;
}
