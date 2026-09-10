const STORAGE_KEY = "cookieConsent";

interface CookieConsent {
  accepted: true;
  acceptedAt: string;
}

type ConsentListener = () => void;

const listeners = new Set<ConsentListener>();

export function subscribeToConsent(listener: ConsentListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getCookieConsent(): CookieConsent | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    return parsed && parsed.accepted === true && typeof parsed.acceptedAt === "string"
      ? (parsed as CookieConsent)
      : null;
  } catch {
    return null;
  }
}

export function acceptCookieConsent(): void {
  const consent: CookieConsent = { accepted: true, acceptedAt: new Date().toISOString() };

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(consent));
  } catch {
    // Local storage may be unavailable (private browsing, quota); the banner will
    // simply reappear on the next load rather than the choice failing to save.
  }

  for (const listener of listeners) {
    listener();
  }
}
