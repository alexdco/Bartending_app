// Pure rules behind the web Back button (spec 0038 AC-8). The in app depth is
// how many in app pages sit behind the current one in this tab: a history
// push adds one, a back or forward (popstate) takes one away, a replace
// changes nothing. A full page load starts at 0, treated as a direct landing.
// Counting real pushes rather than every pathname or search change keeps
// replace navigations (search typing, locale switch) from overcounting.

export type HistoryEvent = "push" | "replace" | "pop";

export function nextDepth(depth: number, event: HistoryEvent): number {
  switch (event) {
    case "push":
      return depth + 1;
    case "pop":
      return Math.max(0, depth - 1);
    case "replace":
      return depth;
  }
}

export type BackAction =
  { readonly kind: "back" } | { readonly kind: "replace"; readonly href: string };

export const DEFAULT_BACK_FALLBACK = "/";

// Back to the previous page when an in app page is behind this one, else the
// page's logical parent (home when none is set).
export function chooseBack(
  depth: number,
  fallbackHref: string = DEFAULT_BACK_FALLBACK,
): BackAction {
  return depth > 0 ? { kind: "back" } : { kind: "replace", href: fallbackHref };
}
