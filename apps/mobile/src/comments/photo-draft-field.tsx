import { useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";

import {
  COMMENT_PHOTO_ALT_MAX_LENGTH,
  COMMENT_PHOTO_DAILY_LIMIT,
  COMMENT_PHOTO_MAX_COUNT,
  getCommentPhotoUrl,
} from "@bartendingapp/shared";
import { Button } from "@/components/button";
import { Text } from "@/components/text";
import { Radii, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { supabase } from "@/lib/supabase";
import type { PhotoDraft, PhotoDraftFailure, usePhotoDrafts } from "./use-photo-drafts";

const PREVIEW_SIZE = 88;

export function photoFailureMessage(failure: PhotoDraftFailure): string {
  switch (failure.reason) {
    case "unsupported_type":
      return "This file type isn't supported. Use JPEG, PNG, WebP, or HEIC.";
    case "original_too_large":
      return "This photo is over 25 MB. Pick a smaller one.";
    case "processing_failed":
      return "Couldn't process this photo.";
    case "too_large":
      return "This photo is too large to upload.";
    case "wrong_type":
      return "This photo couldn't be uploaded.";
    case "daily_limit":
      return `Daily photo limit reached (${COMMENT_PHOTO_DAILY_LIMIT} a day). Try again tomorrow.`;
    case "request_failed":
      return "Upload failed. Check your connection and retry.";
  }
}

function statusMessage(draft: PhotoDraft): string | null {
  if (draft.kind === "existing") return null;
  if (draft.failure) return photoFailureMessage(draft.failure);
  if (draft.status === "processing") return "Preparing...";
  if (draft.status === "uploading") return "Uploading...";
  return null;
}

function previewUri(draft: PhotoDraft): string | null {
  return draft.kind === "existing"
    ? getCommentPhotoUrl(supabase, draft.storagePath)
    : (draft.processed?.uri ?? null);
}

async function pickFromLibrary(limit: number): Promise<ImagePicker.ImagePickerAsset[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: limit > 1,
    selectionLimit: limit,
    quality: 1,
    exif: false,
  });
  return result.canceled ? [] : result.assets;
}

async function takePhoto(): Promise<ImagePicker.ImagePickerAsset[] | "denied"> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return "denied";

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ["images"],
    quality: 1,
    exif: false,
  });
  return result.canceled ? [] : result.assets;
}

export interface PhotoDraftFieldProps {
  photos: ReturnType<typeof usePhotoDrafts>;
  disabled?: boolean;
  /** Retries a failed upload by submitting again; only failed photos are re-sent. */
  onRetryUpload: () => void;
}

/**
 * Pick (library or camera), preview, reorder, replace, remove, and describe
 * up to 3 photos (spec 0032 AC-1, AC-4, AC-5, AC-10, AC-15). Shared by the
 * composer and the edit form.
 */
export function PhotoDraftField({ photos, disabled = false, onRetryUpload }: PhotoDraftFieldProps) {
  const theme = useTheme();
  const [pickerError, setPickerError] = useState<string | null>(null);

  const addFromCamera = async () => {
    setPickerError(null);
    const assets = await takePhoto();
    if (assets === "denied") {
      setPickerError("Allow camera access in Settings to take a photo.");
      return;
    }
    photos.addAssets(assets);
  };

  const replaceFromLibrary = async (key: string) => {
    const [asset] = await pickFromLibrary(1);
    if (asset) photos.replace(key, asset);
  };

  return (
    <View style={styles.container}>
      {photos.drafts.map((draft, index) => {
        const uri = previewUri(draft);
        const message = statusMessage(draft);
        const failure = draft.kind === "new" ? draft.failure : null;
        const position = `photo ${index + 1}`;
        const canRetry =
          failure !== null &&
          failure.reason !== "unsupported_type" &&
          failure.reason !== "original_too_large";

        return (
          <View key={draft.key} style={[styles.draft, { borderColor: theme.border }]}>
            <View style={styles.draftTop}>
              <View style={[styles.preview, { backgroundColor: theme.surfaceSelected }]}>
                {uri && (
                  <Image
                    source={{ uri }}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                    accessible={false}
                  />
                )}
              </View>
              <View style={styles.draftBody}>
                <Text variant="label">Alt text for {position} (optional)</Text>
                <TextInput
                  value={draft.altText}
                  maxLength={COMMENT_PHOTO_ALT_MAX_LENGTH}
                  editable={!disabled}
                  onChangeText={(text) => photos.setAltText(draft.key, text)}
                  placeholder="Describe the photo"
                  placeholderTextColor={theme.textMuted}
                  accessibilityLabel={`Alt text for ${position}`}
                  style={[
                    styles.input,
                    {
                      borderColor: theme.border,
                      backgroundColor: theme.surface,
                      color: theme.text,
                    },
                  ]}
                />
                {message && (
                  <Text
                    variant="bodySmall"
                    muted={!failure}
                    style={failure ? { color: theme.danger } : undefined}
                    accessibilityLiveRegion="polite"
                  >
                    {message}
                  </Text>
                )}
              </View>
            </View>
            <View style={styles.actions}>
              <Button
                variant="secondary"
                disabled={disabled || index === 0}
                onPress={() => photos.move(draft.key, -1)}
                accessibilityLabel={`Move ${position} left`}
              >
                Move left
              </Button>
              <Button
                variant="secondary"
                disabled={disabled || index === photos.drafts.length - 1}
                onPress={() => photos.move(draft.key, 1)}
                accessibilityLabel={`Move ${position} right`}
              >
                Move right
              </Button>
              <Button
                variant="secondary"
                disabled={disabled}
                onPress={() => void replaceFromLibrary(draft.key)}
                accessibilityLabel={`Replace ${position}`}
              >
                Replace
              </Button>
              <Button
                variant="secondary"
                disabled={disabled}
                onPress={() => photos.remove(draft.key)}
                accessibilityLabel={`Remove ${position}`}
              >
                Remove
              </Button>
              {canRetry && (
                <Button
                  disabled={disabled}
                  onPress={() =>
                    failure.stage === "process"
                      ? photos.retryProcessing(draft.key)
                      : onRetryUpload()
                  }
                  accessibilityLabel={`Retry ${position}`}
                >
                  Retry
                </Button>
              )}
            </View>
          </View>
        );
      })}

      {pickerError && (
        <Text variant="bodySmall" style={{ color: theme.danger }}>
          {pickerError}
        </Text>
      )}

      {photos.canAddMore ? (
        <View style={styles.actions}>
          <Button
            variant="secondary"
            disabled={disabled}
            onPress={async () => {
              setPickerError(null);
              photos.addAssets(await pickFromLibrary(photos.remainingSlots));
            }}
          >
            {`Add photo (${photos.drafts.length}/${COMMENT_PHOTO_MAX_COUNT})`}
          </Button>
          <Button variant="secondary" disabled={disabled} onPress={() => void addFromCamera()}>
            Take photo
          </Button>
        </View>
      ) : (
        <Text variant="bodySmall" muted>
          {COMMENT_PHOTO_MAX_COUNT} photos max.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  draft: {
    borderWidth: 1,
    borderRadius: Radii.small,
    padding: Spacing.two,
    gap: Spacing.two,
  },
  draftTop: {
    flexDirection: "row",
    gap: Spacing.two,
  },
  preview: {
    width: PREVIEW_SIZE,
    height: PREVIEW_SIZE,
    borderRadius: Radii.small,
    overflow: "hidden",
  },
  draftBody: {
    flex: 1,
    gap: Spacing.one,
  },
  input: {
    borderWidth: 1,
    borderRadius: Radii.small,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
  },
});
