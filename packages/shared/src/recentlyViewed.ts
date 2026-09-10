export const RECENTLY_VIEWED_CAP = 20;

export function appendRecentlyViewed(
  list: string[],
  id: string,
  cap: number = RECENTLY_VIEWED_CAP,
): string[] {
  const deduped = [id, ...list.filter((existingId) => existingId !== id)];
  return deduped.slice(0, cap);
}
