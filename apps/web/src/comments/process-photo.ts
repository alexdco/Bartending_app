import {
  COMMENT_PHOTO_CONTENT_TYPE,
  COMMENT_PHOTO_JPEG_QUALITY,
  COMMENT_PHOTO_MAX_BYTES,
  scaleToMaxEdge,
  validateCommentPhotoOriginal,
  type CommentPhotoOriginalError,
} from "@bartendingapp/shared";

export interface ProcessedPhoto {
  blob: Blob;
  width: number;
  height: number;
}

export type ProcessPhotoError = CommentPhotoOriginalError | "processing_failed" | "too_large";

export type ProcessPhotoResult =
  { data: ProcessedPhoto; error: null } | { data: null; error: ProcessPhotoError };

function isHeic(file: File): boolean {
  const type = file.type.toLowerCase();
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return (
    type === "image/heic" || type === "image/heif" || extension === "heic" || extension === "heif"
  );
}

/**
 * Most browsers cannot decode HEIC, so it is converted first. heic2any is
 * large, so it is only loaded when a HEIC photo is actually picked.
 */
async function decodableBlob(file: File): Promise<Blob> {
  if (!isHeic(file)) {
    return file;
  }

  const { default: heic2any } = await import("heic2any");
  const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.92 });
  return Array.isArray(converted) ? converted[0]! : converted;
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) =>
    canvas.toBlob(resolve, COMMENT_PHOTO_CONTENT_TYPE, COMMENT_PHOTO_JPEG_QUALITY),
  );
}

/**
 * Spec 0032 AC-3: JPEG, long edge at most 1600 px (never up), about 80%
 * quality, the photo's rotation applied, and no metadata. Drawing to a
 * canvas and re-encoding keeps only pixels, so EXIF (including GPS) is gone.
 */
export async function processPhoto(file: File): Promise<ProcessPhotoResult> {
  const originalError = validateCommentPhotoOriginal({
    sizeBytes: file.size,
    mimeType: file.type,
    fileName: file.name,
  });

  if (originalError) {
    return { data: null, error: originalError };
  }

  try {
    const source = await decodableBlob(file);
    const bitmap = await createImageBitmap(source, { imageOrientation: "from-image" });
    const { width, height } = scaleToMaxEdge(bitmap.width, bitmap.height);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");

    if (!context) {
      bitmap.close();
      return { data: null, error: "processing_failed" };
    }

    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await canvasToJpeg(canvas);

    if (!blob) {
      return { data: null, error: "processing_failed" };
    }

    if (blob.size > COMMENT_PHOTO_MAX_BYTES) {
      return { data: null, error: "too_large" };
    }

    return { data: { blob, width, height }, error: null };
  } catch {
    return { data: null, error: "processing_failed" };
  }
}
