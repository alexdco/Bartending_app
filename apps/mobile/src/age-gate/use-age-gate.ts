import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";
import {
  AGE_CONFIRMED_KEY,
  AGE_GATE_VERSION,
  resolveAgeGateState,
  type AgeGateState,
} from "@bartendingapp/shared";

// Mobile age gate state (spec 0037). "Yes" is stored on the device only;
// "No" lives in memory until the app process restarts (AC-10, AC-11), and so
// does "Continue with mocktails only" (spec 0063 AC-2): never stored, never
// tracked, gone on the next launch. A storage failure leaves the gate working
// for this session and asking again on the next launch (AC-16). Mobile has
// no exempt routes, so the pathname is always null.

type AgeGate = {
  readonly ready: boolean;
  readonly state: AgeGateState;
  readonly confirm: () => void;
  readonly deny: () => void;
  readonly chooseMocktails: () => void;
};

async function readConfirmedValue(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(AGE_CONFIRMED_KEY);
  } catch {
    return null;
  }
}

export function useAgeGate(): AgeGate {
  const [confirmedValue, setConfirmedValue] = useState<string | null | undefined>(undefined);
  const [denied, setDenied] = useState(false);
  const [mocktails, setMocktails] = useState(false);

  useEffect(() => {
    let cancelled = false;
    readConfirmedValue().then((value) => {
      if (!cancelled) setConfirmedValue(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const confirm = useCallback(() => {
    setConfirmedValue(AGE_GATE_VERSION);
    AsyncStorage.setItem(AGE_CONFIRMED_KEY, AGE_GATE_VERSION).catch(() => {
      // The in memory answer still holds for this session.
    });
  }, []);

  const deny = useCallback(() => setDenied(true), []);

  // Only reachable from the blocked screen. There is no way back out inside
  // this app session (spec 0063 AC-3).
  const chooseMocktails = useCallback(() => setMocktails(true), []);

  return {
    ready: confirmedValue !== undefined,
    state: resolveAgeGateState({
      confirmedValue: confirmedValue ?? null,
      denied,
      mocktails,
      pathname: null,
    }),
    confirm,
    deny,
    chooseMocktails,
  };
}
