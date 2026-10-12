"use client";

import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { nextDepth } from "./navigation-history";

// Spec 0038 AC-8: tracks how many in app pages are behind the current one in
// this tab, so BackButton knows whether router.back() stays in the site. The
// App Router navigates through window.history.pushState/replaceState, so
// wrapping pushState counts exactly the navigations that add a history
// entry; popstate covers browser back/forward and router.back().
const NavigationDepthContext = createContext<() => number>(() => 0);

export function NavigationHistoryProvider({ children }: { children: ReactNode }) {
  const depthRef = useRef(0);

  useEffect(() => {
    const history = window.history;
    const basePushState = history.pushState;
    let active = true;

    const countingPushState: History["pushState"] = function (this: History, ...args) {
      if (active) {
        depthRef.current = nextDepth(depthRef.current, "push");
      }
      return basePushState.apply(this, args);
    };
    history.pushState = countingPushState;

    const onPopState = () => {
      depthRef.current = nextDepth(depthRef.current, "pop");
    };
    window.addEventListener("popstate", onPopState);

    return () => {
      active = false;
      window.removeEventListener("popstate", onPopState);
      // Only unwrap when nothing (e.g. Next's own patch) wrapped us since.
      if (history.pushState === countingPushState) {
        history.pushState = basePushState;
      }
    };
  }, []);

  return (
    <NavigationDepthContext.Provider value={() => depthRef.current}>
      {children}
    </NavigationDepthContext.Provider>
  );
}

export function useNavigationDepth(): () => number {
  return useContext(NavigationDepthContext);
}
