"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";
import { usePathname } from "@/i18n/navigation";
import { AGE_GATE_VERSION, resolveAgeGateState, type AgeGateState } from "@bartendingapp/shared";
import {
  readConfirmedValue,
  readDenied,
  readMocktails,
  writeConfirmed,
  writeDenied,
  writeMocktails,
} from "./age-gate-storage";

// External store for the age answer (spec 0037) and the mocktails only
// choice (spec 0063). The inline head script in the locale layout sets
// html[data-age] before paint from the same storage keys; this store takes
// over after hydration, recomputes the state on every client navigation, and
// keeps the attribute and `inert` in sync.

type Answer = {
  readonly confirmedValue: string | null;
  readonly denied: boolean;
  readonly mocktails: boolean;
};

// "unknown" is the server and hydration value: storage can't be read there,
// so nothing may touch html[data-age] until the client value is known
// (otherwise a confirmed visitor could see the gate flash after hydration).
export type WebAgeGateState = AgeGateState | "unknown";

let answer: Answer | null = null;
const listeners = new Set<() => void>();

function readAnswer(): Answer {
  answer ??= {
    confirmedValue: readConfirmedValue(),
    denied: readDenied(),
    mocktails: readMocktails(),
  };
  return answer;
}

function readServerAnswer(): Answer | null {
  return null;
}

function setAnswer(next: Answer): void {
  answer = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function confirmAge(): void {
  writeConfirmed();
  setAnswer({ ...readAnswer(), confirmedValue: readConfirmedValue(), denied: false });
}

export function denyAge(): void {
  writeDenied();
  setAnswer({ ...readAnswer(), denied: true });
}

// Spec 0063 AC-1: "Continue with mocktails only" on the blocked screen.
export function chooseMocktails(): void {
  writeMocktails();
  setAnswer({ ...readAnswer(), mocktails: true });
}

export function useAgeGateState(): WebAgeGateState {
  const current = useSyncExternalStore<Answer | null>(subscribe, readAnswer, readServerAnswer);
  const pathname = usePathname();
  return current === null ? "unknown" : resolveAgeGateState({ ...current, pathname });
}

function isMocktailsAnswer(current: Answer): boolean {
  // Confirmed always wins over mocktails (spec 0063 AC-3).
  return current.mocktails && current.confirmedValue !== AGE_GATE_VERSION;
}

export type MocktailsState = "unknown" | boolean;

// Whether this tab is in mocktails only mode, independent of the route, so
// exempt routes like /privacy keep the badge and the hidden nav entries.
// "unknown" until the client store is read: filtered queries pass
// `enabled: state !== "unknown"` so no unflagged list can paint (AC-19).
export function useMocktailsState(): MocktailsState {
  const current = useSyncExternalStore<Answer | null>(subscribe, readAnswer, readServerAnswer);
  return current === null ? "unknown" : isMocktailsAnswer(current);
}

/** True only once the mode is known and on. */
export function useMocktailsOnly(): boolean {
  return useMocktailsState() === true;
}

export function isAgeGateOpen(state: WebAgeGateState): boolean {
  return state === "ask" || state === "denied";
}

const DATA_AGE: Record<AgeGateState, string> = {
  exempt: "exempt",
  confirmed: "ok",
  mocktails: "mocktails",
  denied: "denied",
  ask: "ask",
};

export const APP_CONTENT_ID = "app-content";

// Mirrors the state onto html[data-age] (which the CSS reads to show the
// gate, and in mocktails only mode to hide marked content) and makes the page
// behind it inert while the gate shows.
export function useAgeGateDomSync(state: WebAgeGateState, mocktails: MocktailsState): void {
  useLayoutEffect(() => {
    if (state === "unknown") return;
    // Exempt routes render normally, but html[data-age] stays "mocktails" so
    // the hidden nav entries and the badge keep the mode (spec 0063 AC-14).
    document.documentElement.dataset.age =
      state === "exempt" && mocktails === true ? DATA_AGE.mocktails : DATA_AGE[state];
    document.getElementById(APP_CONTENT_ID)?.toggleAttribute("inert", isAgeGateOpen(state));
  }, [state, mocktails]);
}
