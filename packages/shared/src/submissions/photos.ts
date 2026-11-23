/**
 * Spec 0064 AC-8: the private bucket for submission photos. A submission's
 * `photo_path` is `<author_id>/<submission id>-<16 hex>`, and its files are
 * that path plus `-hero.webp` and `-card.webp`. The pair comes from the same
 * spec 0041 crop as recipe images; the 16 hex are the hero's content hash.
 */
export const RECIPE_SUBMISSION_PHOTOS_BUCKET = "recipe-submission-photos";

/** How long a signed URL for a private submission photo stays valid. */
export const SUBMISSION_PHOTO_SIGNED_URL_SECONDS = 60 * 60;

export type SubmissionPhotoSize = "hero" | "card";

/** `<authorId>/<submissionId>-<hash>`, the shape save_recipe_submission accepts. */
export function submissionPhotoPath(authorId: string, submissionId: string, hash: string): string {
  return `${authorId}/${submissionId}-${hash}`;
}

/** One stored file of a photo path. */
export function submissionPhotoFile(photoPath: string, size: SubmissionPhotoSize): string {
  return `${photoPath}-${size}.webp`;
}

/** Both stored files for a photo path, hero first. */
export function submissionPhotoFiles(photoPath: string): [string, string] {
  return [submissionPhotoFile(photoPath, "hero"), submissionPhotoFile(photoPath, "card")];
}
