const WHITESPACE_RUN = /\s+/;

function firstCodePointUpper(word: string): string {
  const [first] = Array.from(word);
  return first ? Array.from(first.toLocaleUpperCase())[0] : "";
}

function initialsFromName(name: string): string {
  const tokens = name.trim().split(WHITESPACE_RUN).filter(Boolean);
  const letters = tokens.slice(0, 2).map(firstCodePointUpper).filter(Boolean);
  return letters.join("");
}

function initialFromEmail(email: string): string {
  const [first] = Array.from(email);
  return first ? Array.from(first.toLocaleUpperCase())[0] : "";
}

/**
 * Exact algorithm from spec 0018: name initials (1-2 code points, one per token),
 * falling back to the email's first code point, falling back to "?" if neither exists.
 */
export function getInitials(
  displayName: string | null | undefined,
  email: string | null | undefined,
): string {
  if (displayName) {
    const fromName = initialsFromName(displayName);
    if (fromName) {
      return fromName;
    }
  }

  if (email) {
    const fromEmail = initialFromEmail(email);
    if (fromEmail) {
      return fromEmail;
    }
  }

  return "?";
}

const MIN_DISPLAY_NAME_LENGTH = 1;
const MAX_DISPLAY_NAME_LENGTH = 50;

export type DisplayNameValidationError = "too_short" | "too_long";

/**
 * Trims the raw input and validates its length. A trimmed-to-empty value is valid
 * (it means "clear the name"); only a non-empty value outside 1-50 chars is rejected.
 */
export function validateDisplayName(
  rawValue: string,
): { trimmed: string; error: null } | { trimmed: string; error: DisplayNameValidationError } {
  const trimmed = rawValue.trim();

  if (trimmed.length === 0) {
    return { trimmed, error: null };
  }

  if (trimmed.length < MIN_DISPLAY_NAME_LENGTH) {
    return { trimmed, error: "too_short" };
  }

  if (trimmed.length > MAX_DISPLAY_NAME_LENGTH) {
    return { trimmed, error: "too_long" };
  }

  return { trimmed, error: null };
}
