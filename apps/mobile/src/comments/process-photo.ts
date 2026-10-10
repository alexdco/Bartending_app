import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import type { ImagePickerAsset } from "expo-image-picker";

import {
  COMMENT_PHOTO_JPEG_QUALITY,
  COMMENT_PHOTO_MAX_BYTES,
  scaleToMaxEdge,
  validateCommentPhotoOriginal,
  type CommentPhotoOriginalError,
} from "@bartendingapp/shared";

export interface ProcessedPhoto {
  uri: string;
  bytes: ArrayBuffer;
  width: number;
  height: number;
}

export type ProcessPhotoError = CommentPhotoOriginalError | "processing_failed" | "too_large";

export type ProcessPhotoResult =
  { data: ProcessedPhoto; error: null } | { data: null; error: ProcessPhotoError };

/**
 * Spec 0032 AC-3: JPEG, long edge at most 1600 px (never up), about 80%
 * quality, the photo's rotation applied, and no metadata. The manipulator
 * renders oriented pixels and saves a fresh JPEG without the original EXIF
 * (including GPS).
 */
export async function processPhoto(asset: ImagePickerAsset): Promise<ProcessPhotoResult> {
  const originalError = validateCommentPhotoOriginal({
    // Some pickers omit the size; the 25 MB guard then cannot apply.
    sizeBytes: asset.fileSize ?? 0,
    mimeType: asset.mimeType ?? null,
    fileName: asset.fileName ?? null,
  });

  if (originalError) {
    return { data: null, error: originalError };
  }

  try {
    const oriented = await ImageManipulator.manipulate(asset.uri).renderAsync();
    const { width, height } = scaleToMaxEdge(oriented.width, oriented.height);

    const context = ImageManipulator.manipulate(oriented);
    const rendered =
      width === oriented.width && height === oriented.height
        ? oriented
        : await context.resize({ width, height }).renderAsync();

    const saved = await rendered.saveAsync({
      compress: COMMENT_PHOTO_JPEG_QUALITY,
      format: SaveFormat.JPEG,
    });

    const bytes = await fetch(saved.uri).then((response) => response.arrayBuffer());

    if (bytes.byteLength > COMMENT_PHOTO_MAX_BYTES) {
      return { data: null, error: "too_large" };
    }

    return {
      data: { uri: saved.uri, bytes, width: saved.width, height: saved.height },
      error: null,
    };
  } catch {
    return { data: null, error: "processing_failed" };
  }
}
