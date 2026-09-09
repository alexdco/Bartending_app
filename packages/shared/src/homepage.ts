export const HOMEPAGE_CAROUSEL_LIMIT = 10;

const SESSION_ERROR_CODE = "28000";

export function isSessionError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === SESSION_ERROR_CODE
  );
}
