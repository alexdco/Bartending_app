import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { router } from "expo-router";

import {
  REPORT_NOTE_MAX_LENGTH,
  REPORT_REASONS,
  validateReportNote,
  type ReportContentError,
  type ReportReason,
  type ReportTarget,
} from "@bartendingapp/shared";
import { Button } from "@/components/button";
import { Text } from "@/components/text";
import { Radii, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useSession } from "@/auth/use-session";
import { useReportContent } from "./use-comment-mutations";

function reportErrorMessage(t: TFunction, error: ReportContentError): string {
  switch (error.reason) {
    case "already_reported":
    case "report_limit":
    case "not_found":
    case "own_content":
    case "not_signed_in":
      return t(`comments.report.errors.${error.reason}`);
    case "invalid_input":
      return t("comments.report.errors.invalid_input", { max: REPORT_NOTE_MAX_LENGTH });
    case "request_failed":
      return t("comments.report.errors.generic");
  }
}

export interface ReportDialogProps {
  recipeId: string;
  /** What to report, or null when closed. */
  target: ReportTarget | null;
  onClose: () => void;
}

/**
 * Report a comment or one photo (spec 0062 AC-6 to AC-8, AC-17). Guests see
 * a sign in prompt instead of the form. After a report the target has
 * already left the list; the dialog stays open on the thank you.
 *
 * Mount with a `key` per target so each report starts from a blank form.
 */
export function ReportDialog({ recipeId, target, onClose }: ReportDialogProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const { isLinked } = useSession();
  const report = useReportContent(recipeId);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isDone, setIsDone] = useState(false);

  const title =
    target?.kind === "photo" ? t("comments.report.photoTitle") : t("comments.report.commentTitle");
  const noteLength = [...note.trim()].length;
  const noteTooLong = noteLength > REPORT_NOTE_MAX_LENGTH;

  const submit = async () => {
    if (!target || !reason) return;
    setError(null);

    if (validateReportNote(note) !== null) {
      setError(reportErrorMessage(t, { reason: "invalid_input" }));
      return;
    }

    const result = await report.mutateAsync({ target, reason, note });
    if (result.data) {
      setIsDone(true);
      return;
    }
    setError(reportErrorMessage(t, result.error));
  };

  return (
    <Modal
      visible={target !== null}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      supportedOrientations={["portrait", "landscape"]}
    >
      <View style={styles.backdrop}>
        <View
          style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.border }]}
          accessibilityViewIsModal
        >
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text variant="subheading" accessibilityRole="header">
              {title}
            </Text>

            {!isLinked ? (
              <>
                <Text variant="body">{t("comments.report.errors.not_signed_in")}</Text>
                <View style={styles.actions}>
                  <Button variant="secondary" onPress={onClose}>
                    {t("comments.close")}
                  </Button>
                  <Button
                    onPress={() => {
                      onClose();
                      router.push("/account");
                    }}
                  >
                    {t("account.signIn")}
                  </Button>
                </View>
              </>
            ) : isDone ? (
              <>
                <Text variant="body" accessibilityLiveRegion="polite">
                  {t("comments.report.thanks")}
                </Text>
                <View style={styles.actions}>
                  <Button onPress={onClose}>{t("comments.close")}</Button>
                </View>
              </>
            ) : (
              <>
                <View accessibilityRole="radiogroup" style={styles.reasons}>
                  <Text variant="label">{t("comments.report.reasonLabel")}</Text>
                  {REPORT_REASONS.map((value) => {
                    const selected = reason === value;
                    return (
                      <Pressable
                        key={value}
                        onPress={() => setReason(value)}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: selected }}
                        style={styles.reasonRow}
                      >
                        <View
                          style={[
                            styles.radio,
                            { borderColor: selected ? theme.accent : theme.border },
                          ]}
                        >
                          {selected && (
                            <View style={[styles.radioDot, { backgroundColor: theme.accent }]} />
                          )}
                        </View>
                        <Text variant="body">{t(`comments.report.reasons.${value}`)}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={styles.noteField}>
                  <Text variant="label">{t("comments.report.noteLabel")}</Text>
                  <TextInput
                    value={note}
                    onChangeText={setNote}
                    maxLength={REPORT_NOTE_MAX_LENGTH + 50}
                    accessibilityLabel={t("comments.report.noteLabel")}
                    multiline
                    numberOfLines={3}
                    style={[
                      styles.input,
                      { borderColor: theme.border, backgroundColor: theme.bg, color: theme.text },
                    ]}
                  />
                  <Text
                    variant="bodySmall"
                    muted={!noteTooLong}
                    style={[styles.counter, noteTooLong && { color: theme.danger }]}
                  >
                    {t("comments.report.noteCounter", {
                      count: noteLength,
                      max: REPORT_NOTE_MAX_LENGTH,
                    })}
                  </Text>
                </View>

                {error && (
                  <Text
                    variant="bodySmall"
                    style={{ color: theme.danger }}
                    accessibilityLiveRegion="polite"
                  >
                    {error}
                  </Text>
                )}

                <View style={styles.actions}>
                  <Button variant="secondary" onPress={onClose} disabled={report.isPending}>
                    {t("comments.cancel")}
                  </Button>
                  <Button disabled={!reason || report.isPending} onPress={() => void submit()}>
                    {report.isPending ? t("comments.report.sending") : t("comments.report.submit")}
                  </Button>
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "center",
    padding: Spacing.four,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
  },
  sheet: {
    maxHeight: "90%",
    borderWidth: 1,
    borderRadius: Radii.medium,
  },
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  reasons: {
    gap: Spacing.two,
  },
  reasonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    minHeight: 44,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  noteField: {
    gap: Spacing.one,
  },
  input: {
    borderWidth: 1,
    borderRadius: Radii.small,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    minHeight: 80,
    textAlignVertical: "top",
  },
  counter: {
    alignSelf: "flex-end",
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: Spacing.two,
  },
});
