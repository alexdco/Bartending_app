import { MocktailsHiddenArea } from "@/mocktails/mocktails-hidden-area";

// Spec 0063 AC-10: quizzes show the notice in mocktails only mode.
export default function QuizzesLayout({ children }: LayoutProps<"/[locale]/quizzes">) {
  return <MocktailsHiddenArea>{children}</MocktailsHiddenArea>;
}
