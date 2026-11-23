/**
 * Spec 0064 AC-8: the private bucket for submission photos. A submission's
 * `photo_path` is `<author_id>/<submission id>-<16 hex>`, and its files are
 * that path plus `-hero.webp` and `-card.webp`.
 */
export const RECIPE_SUBMISSION_PHOTOS_BUCKET = "recipe-submission-photos";

/** Both stored files for a photo path, hero first. */
export function submissionPhotoFiles(photoPath: string): [string, string] {
  return [`${photoPath}-hero.webp`, `${photoPath}-card.webp`];
}
