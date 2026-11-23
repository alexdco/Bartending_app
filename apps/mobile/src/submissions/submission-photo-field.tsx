import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useTranslation } from "react-i18next";
import type { SubmissionPhotoChange } from "@bartendingapp/shared";

import { Button } from "@/components/button";
import { Text } from "@/components/text";
import { Radii, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import {
  processSubmissionPhoto,
  type ProcessSubmissionPhotoError,
} from "./process-submission-photo";

const PREVIEW_SIZE = 120;

const ERROR_KEY: Record<ProcessSubmissionPhotoError, string> = {
  unsupported_type: "submissions.photoErrorUnsupportedType",
  too_large: "submissions.photoErrorTooLarge",
  too_small: "submissions.photoErrorTooSmall",
  decode_failed: "submissions.photoErrorDecodeFailed",
};

async function pickPhoto(): Promise<ImagePicker.ImagePickerAsset | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: false,
    quality: 1,
    exif: false,
    // iOS hands HEIC originals over as JPEG, one of the spec 0041 input types.
    preferredAssetRepresentationMode:
      ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
  });
  return result.canceled ? null : (result.assets[0] ?? null);
}

export interface SubmissionPhotoFieldProps {
  /** A signed URL for the row's current photo, once loaded. */
  currentUrl: string | null;
  hasCurrent: boolean;
  change: SubmissionPhotoChange;
  onChange: (change: SubmissionPhotoChange) => void;
  disabled?: boolean;
}

/**
 * Attach, replace, or remove the one optional photo (spec 0064 AC-8). Picking
 * runs the spec 0041 crop right away, so a bad file is rejected before the
 * save; the pair uploads to the private bucket when the form saves.
 */
export function SubmissionPhotoField({
  currentUrl,
  hasCurrent,
  change,
  onChange,
  disabled = false,
}: SubmissionPhotoFieldProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newPreviewUri, setNewPreviewUri] = useState<string | null>(null);

  const previewUri =
    change.kind === "replace" ? newPreviewUri : change.kind === "keep" ? currentUrl : null;
  const hasPhoto = change.kind === "replace" || (change.kind === "keep" && hasCurrent);
  const isBusy = disabled || isProcessing;

  const handlePick = async () => {
    setError(null);
    const asset = await pickPhoto();
    if (!asset) return;

    setIsProcessing(true);
    const result = await processSubmissionPhoto(asset);
    setIsProcessing(false);

    if (result.error) {
      setError(t(ERROR_KEY[result.error]));
      return;
    }
    setNewPreviewUri(result.data.previewUri);
    onChange({ kind: "replace", image: result.data.image });
  };

  return (
    <View style={styles.container}>
      <Text variant="label">{t("submissions.photo")}</Text>
      <Text variant="bodySmall" muted>
        {t("submissions.photoHint")}
      </Text>

      <View
        style={[styles.preview, { backgroundColor: theme.surfaceSelected }]}
        accessibilityLabel={previewUri ? t("submissions.photoPreviewAlt") : undefined}
      >
        {previewUri ? (
          <Image
            source={{ uri: previewUri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            accessible={false}
          />
        ) : (
          <Text variant="bodySmall" muted style={styles.previewText}>
            {hasPhoto ? t("submissions.photoLoading") : t("submissions.noPhoto")}
          </Text>
        )}
      </View>

      {change.kind === "remove" && hasCurrent && (
        <Text variant="bodySmall" muted accessibilityLiveRegion="polite">
          {t("submissions.photoWillBeRemoved")}
        </Text>
      )}
      {isProcessing && (
        <Text variant="bodySmall" muted accessibilityLiveRegion="polite">
          {t("submissions.photoPreparing")}
        </Text>
      )}
      {error && (
        <Text
          variant="bodySmall"
          style={{ color: theme.danger }}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          {error}
        </Text>
      )}

      <View style={styles.actions}>
        <Button variant="secondary" disabled={isBusy} onPress={handlePick}>
          {hasPhoto ? t("submissions.replacePhoto") : t("submissions.choosePhoto")}
        </Button>
        {hasPhoto && (
          <Button
            variant="secondary"
            disabled={isBusy}
            onPress={() => {
              setError(null);
              onChange({ kind: "remove" });
            }}
          >
            {t("submissions.removePhoto")}
          </Button>
        )}
        {change.kind !== "keep" && hasCurrent && (
          <Button
            variant="secondary"
            disabled={isBusy}
            onPress={() => {
              setError(null);
              onChange({ kind: "keep" });
            }}
          >
            {t("submissions.undoPhotoChange")}
          </Button>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  preview: {
    width: PREVIEW_SIZE,
    height: PREVIEW_SIZE,
    borderRadius: Radii.medium,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  previewText: {
    textAlign: "center",
    padding: Spacing.two,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
  },
});
