import type { ComponentType } from "react";

import { useMocktailsOnly } from "./mocktails-context";
import { MocktailsUnavailable } from "./mocktails-unavailable";

// Wraps a whole screen that is hidden in mocktails only mode (spec 0063 AC-10
// to AC-12): quizzes, service, bartender, bar, and account screens. In the
// mode the notice renders instead, and the wrapped screen never mounts, so its
// queries never run. Everyone else gets the screen unchanged.
export function withMocktailsHidden<P extends object>(Screen: ComponentType<P>) {
  function MocktailsHiddenScreen(props: P) {
    return useMocktailsOnly() ? <MocktailsUnavailable /> : <Screen {...props} />;
  }
  MocktailsHiddenScreen.displayName = `MocktailsHidden(${Screen.displayName ?? Screen.name})`;
  return MocktailsHiddenScreen;
}
