import { useRef, useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Image } from "expo-image";

import {
  commentPhotoLabel,
  getCommentPhotoUrl,
  moderationNote,
  type CommentPhoto,
} from "@bartendingapp/shared";
import { Button } from "@/components/button";
import { Text } from "@/components/text";
import { Radii, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { supabase } from "@/lib/supabase";

/** Thumbnail height; width follows the stored aspect ratio. */
const THUMBNAIL_HEIGHT = 96;

export interface CommentPhotoThumbnailsProps {
  photos: readonly CommentPhoto[];
  displayName: string | null;
  /** Shown in the viewer for other people's photos (spec 0062 AC-6). */
  onReportPhoto?: (photoId: string) => void;
}

/**
 * A comment's photos as a row of thumbnails under its text (spec 0032
 * AC-9), sized from the stored width and height so nothing shifts as they
 * load. expo-image loads them lazily with its disk cache. Tapping one opens
 * a full screen viewer that closes with the back gesture. The author sees
 * "Checking photo" or "Hidden while under review" under a photo others can't
 * see yet (spec 0062 AC-1, AC-10).
 */
export function CommentPhotoThumbnails({
  photos,
  displayName,
  onReportPhoto,
}: CommentPhotoThumbnailsProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  // iOS can't present the report modal while this one is still closing, so
  // the report waits for onDismiss there; Android opens it straight away.
  const reportAfterDismiss = useRef<string | null>(null);

  const reportOpenPhoto = (photoId: string) => {
    setOpenIndex(null);
    if (Platform.OS === "ios") reportAfterDismiss.current = photoId;
    else onReportPhoto?.(photoId);
  };

  if (photos.length === 0) return null;

  const open = openIndex === null ? undefined : photos[openIndex];

  return (
    <>
      <View style={styles.row}>
        {photos.map((photo, index) => {
          const label = commentPhotoLabel(photo, photos.length, displayName);
          const width = Math.round((photo.width / photo.height) * THUMBNAIL_HEIGHT);
          const note = moderationNote(photo.moderationStatus);
          return (
            <View key={photo.id} style={[styles.item, { width }]}>
              <Pressable
                onPress={() => setOpenIndex(index)}
                accessibilityRole="imagebutton"
                accessibilityLabel={label}
                accessibilityHint="Opens the full size photo"
                style={[
                  styles.thumbnail,
                  {
                    width,
                    borderColor: theme.border,
                    backgroundColor: theme.surfaceSelected,
                  },
                ]}
              >
                <Image
                  source={{ uri: getCommentPhotoUrl(supabase, photo.storagePath) }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  cachePolicy="disk"
                  accessible={false}
                />
              </Pressable>
              {note && (
                <Text variant="bodySmall" muted>
                  {note === "checking" ? t("comments.checkingPhoto") : t("comments.underReview")}
                </Text>
              )}
            </View>
          );
        })}
      </View>

      <Modal
        visible={open !== undefined}
        animationType="fade"
        onRequestClose={() => setOpenIndex(null)}
        onDismiss={() => {
          const photoId = reportAfterDismiss.current;
          reportAfterDismiss.current = null;
          if (photoId) onReportPhoto?.(photoId);
        }}
        supportedOrientations={["portrait", "landscape"]}
      >
        {open && openIndex !== null && (
          <View style={[styles.viewer, { backgroundColor: theme.bg }]}>
            <View style={styles.viewerHeader}>
              <Text variant="bodySmall" muted accessibilityLiveRegion="polite">
                {`${openIndex + 1} / ${photos.length}`}
              </Text>
              <View style={styles.viewerActions}>
                {onReportPhoto && (
                  <Button variant="secondary" onPress={() => reportOpenPhoto(open.id)}>
                    {t("comments.report.photoAction")}
                  </Button>
                )}
                <Button variant="secondary" onPress={() => setOpenIndex(null)}>
                  {t("comments.close")}
                </Button>
              </View>
            </View>
            <Image
              source={{ uri: getCommentPhotoUrl(supabase, open.storagePath) }}
              style={styles.fullImage}
              contentFit="contain"
              cachePolicy="disk"
              accessibilityLabel={commentPhotoLabel(open, photos.length, displayName)}
            />
            {open.altText && (
              <Text variant="bodySmall" muted>
                {open.altText}
              </Text>
            )}
            {photos.length > 1 && (
              <View style={styles.viewerNav}>
                <Button
                  variant="secondary"
                  disabled={openIndex === 0}
                  onPress={() => setOpenIndex(openIndex - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  disabled={openIndex === photos.length - 1}
                  onPress={() => setOpenIndex(openIndex + 1)}
                >
                  Next
                </Button>
              </View>
            )}
          </View>
        )}
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
  },
  item: {
    gap: Spacing.one,
  },
  thumbnail: {
    height: THUMBNAIL_HEIGHT,
    borderWidth: 1,
    borderRadius: Radii.small,
    overflow: "hidden",
  },
  viewer: {
    flex: 1,
    padding: Spacing.four,
    paddingTop: Spacing.six,
    gap: Spacing.three,
  },
  viewerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  viewerActions: {
    flexDirection: "row",
    gap: Spacing.two,
  },
  fullImage: {
    flex: 1,
  },
  viewerNav: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
});
