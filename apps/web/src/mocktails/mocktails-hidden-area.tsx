import type { ReactNode } from "react";
import { MocktailsUnavailable } from "./mocktails-unavailable";

// A whole area hidden in mocktails only mode (spec 0063 AC-9 to AC-12, AC-14):
// Learn spirits, wine, and beer; quizzes; service; account; admin. Used by
// those routes' layouts. The page renders as usual for everyone, inside a
// wrapper that globals.css hides under html[data-age="mocktails"] before
// paint, and the notice beside it shows only in the mode. Adults get the same
// HTML with the notice hidden, so cached and static pages stay shared.
export function MocktailsHiddenArea({ children }: { children: ReactNode }) {
  return (
    <>
      <div data-mocktails="hide" className="flex flex-1 flex-col">
        {children}
      </div>
      <main data-mocktails="notice" className="flex flex-1 flex-col gap-four p-six">
        <MocktailsUnavailable />
      </main>
    </>
  );
}
