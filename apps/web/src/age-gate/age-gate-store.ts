"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";
import { usePathname } from "@/i18n/navigation";
import { resolveAgeGateState, type AgeGateState } from "@bartendingapp/shared";
import { readConfirmedValue, readDenied, writeConfirmed, writeDenied } from "./age-gate-storage";

// External store for the age answer (spec 0037). The inline head script in
// the locale layout sets html[data-age] before paint from the same storage
// keys; this store takes over after hydration, recomputes the state on every
// client navigation, and keeps the attribute and `inert` in sync.

type Answer = { readonly confirmedValue: string | null; readonly denied: boolean };

// "unknown" is the server and hydration value: storage can't be read there,
// so nothing may touch html[data-age] until the client value is known
// (otherwise a confirmed visitor could see the gate flash after hydration).
export type WebAgeGateState = AgeGateState | "unknown";

let answer: Answer | null = null;
const listeners = new Set<() => void>();

function readAnswer(): Answer {
  answer ??= { confirmedValue: readConfirmedValue(), denied: readDenied() };
  return answer;
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
  setAnswer({ confirmedValue: readConfirmedValue(), denied: false });
}

export function denyAge(): void {
  writeDenied();
  setAnswer({ ...readAnswer(), denied: true });
}

export function useAgeGateState(): WebAgeGateState {
  const current = useSyncExternalStore<Answer | null>(subscribe, readAnswer, () => null);
  const pathname = usePathname();
  return current === null ? "unknown" : resolveAgeGateState({ ...current, pathname });
}

export function isAgeGateOpen(state: WebAgeGateState): boolean {
  return state === "ask" || state === "denied";
}

const DATA_AGE: Record<AgeGateState, string> = {
  exempt: "exempt",
  confirmed: "ok",
  denied: "denied",
  ask: "ask",
};

export const APP_CONTENT_ID = "app-content";

// Mirrors the state onto html[data-age] (which the CSS reads to show the
// gate) and makes the page behind it inert while the gate shows.
export function useAgeGateDomSync(state: WebAgeGateState): void {
  useLayoutEffect(() => {
    if (state === "unknown") return;
    document.documentElement.dataset.age = DATA_AGE[state];
    document.getElementById(APP_CONTENT_ID)?.toggleAttribute("inert", isAgeGateOpen(state));
  }, [state]);
}
