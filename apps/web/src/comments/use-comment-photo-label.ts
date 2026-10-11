import { useTranslations } from "next-intl";
import type { CommentPhoto } from "@bartendingapp/shared";

/**
 * A photo's accessible label in the current locale: its alt text, or
 * "Photo N of M by <name>" when it has none (spec 0032 AC-9).
 */
export function useCommentPhotoLabel() {
  const t = useTranslations("comments");

  return (
    photo: Pick<CommentPhoto, "altText" | "position">,
    photoCount: number,
    displayName: string | null,
  ): string =>
    photo.altText ??
    t("photoLabel", {
      number: photo.position + 1,
      total: photoCount,
      name: displayName ?? t("anonymous"),
    });
}
