import { AGE_CONFIRMED_KEY, AGE_DENIED_KEY, AGE_GATE_VERSION } from "@bartendingapp/shared";

// Device only storage for the age answer (spec 0037, AC-10, AC-11, AC-16).
// Every access is try wrapped: when storage is blocked or throws (private
// mode, quota), the answer falls back to memory for this page load, so the
// gate still works now and simply asks again on the next load.

let memoryConfirmed: string | null = null;
let memoryDenied = false;

function safeGet(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}

function safeSet(storage: () => Storage, key: string, value: string): void {
  try {
    storage().setItem(key, value);
  } catch {
    // Memory fallback already holds the answer for this page load.
  }
}

const local = () => window.localStorage;
const session = () => window.sessionStorage;

export function readConfirmedValue(): string | null {
  return memoryConfirmed ?? safeGet(local, AGE_CONFIRMED_KEY);
}

export function readDenied(): boolean {
  return memoryDenied || safeGet(session, AGE_DENIED_KEY) === "1";
}

export function writeConfirmed(): void {
  memoryConfirmed = AGE_GATE_VERSION;
  safeSet(local, AGE_CONFIRMED_KEY, AGE_GATE_VERSION);
}

export function writeDenied(): void {
  memoryDenied = true;
  safeSet(session, AGE_DENIED_KEY, "1");
}
