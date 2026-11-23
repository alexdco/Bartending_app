import { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  recipeImageUrl,
  type MyRecipeSubmissionSummary,
  type SubmissionStatus,
} from "@bartendingapp/shared";

import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { Spinner } from "@/components/spinner";
import { Text } from "@/components/text";
import { Radii, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import {
  useMyRecipeSubmissions,
  useSubmissionPhotoUrls,
  useWithdrawRecipeSubmission,
} from "./use-submissions";

const THUMBNAIL_SIZE = 64;

const STATUS_KEY: Record<SubmissionStatus, string> = {
  pending: "submissions.statusPending",
  approved: "submissions.statusApproved",
  rejected: "submissions.statusRejected",
};

/** The author's submissions and where each stands (spec 0064 AC-1, AC-6, AC-13). */
export function MyRecipesList({ header }: { header: React.ReactElement }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { data, error, isPending, isFetchingNextPage, hasNextPage, fetchNextPage, refetch } =
    useMyRecipeSubmissions();
  const items = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data]);
  const { data: photoUrls } = useSubmissionPhotoUrls(
    items.map((item) => item.photoPath),
    "card",
  );

  const body = error ? (
    <EmptyState
      title={t("common.somethingWentWrong")}
      description={t("submissions.loadFailed")}
      action={<Button onPress={() => refetch()}>{t("common.retry")}</Button>}
    />
  ) : isPending ? (
    <View style={styles.centered}>
      <Spinner label={t("submissions.loading")} />
    </View>
  ) : (
    <EmptyState
      title={t("submissions.emptyTitle")}
      description={t("submissions.emptyDescription")}
      action={
        <Button onPress={() => router.push("/my-recipes/new")}>{t("submissions.submitCta")}</Button>
      }
    />
  );

  return (
    <FlatList
      data={error || isPending ? [] : items}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      ListHeaderComponent={header}
      ListEmptyComponent={body}
      renderItem={({ item }) => (
        <MySubmissionRow
          item={item}
          photoUrl={item.photoPath ? (photoUrls?.[item.photoPath] ?? null) : null}
        />
      )}
      ListFooterComponent={
        hasNextPage ? (
          <Button variant="secondary" disabled={isFetchingNextPage} onPress={() => fetchNextPage()}>
            {isFetchingNextPage ? t("submissions.loadingMore") : t("submissions.loadMore")}
          </Button>
        ) : null
      }
    />
  );
}

function MySubmissionRow({
  item,
  photoUrl,
}: {
  item: MyRecipeSubmissionSummary;
  /** A signed URL for a pending or rejected row's own photo. */
  photoUrl: string | null;
}) {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const liveRecipe =
    item.status === "approved" && item.approvedRecipeId !== null && !item.recipeRemoved
      ? { id: item.approvedRecipeId, name: item.recipeName ?? item.name }
      : null;
  const thumbnail = liveRecipe ? recipeImageUrl(item.recipeImageUrl, "card") : photoUrl;
  const statusColors =
    item.status === "approved"
      ? { backgroundColor: theme.accent, color: theme.accentText }
      : item.status === "rejected"
        ? { borderColor: theme.danger, borderWidth: 1, color: theme.danger }
        : { backgroundColor: theme.surfaceSelected, color: theme.text };

  return (
    <View style={[styles.row, { borderColor: theme.border }]}>
      <View style={styles.rowTop}>
        <View style={[styles.thumbnail, { backgroundColor: theme.surfaceSelected }]}>
          {thumbnail && (
            <Image
              source={{ uri: thumbnail }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              accessibilityLabel={t("submissions.photoThumbnailAlt")}
            />
          )}
        </View>
        {/* Author text renders as plain text only (invariant 8). */}
        <Text variant="subheading" style={styles.rowName}>
          {liveRecipe?.name ?? item.name}
        </Text>
        <Text variant="label" style={[styles.status, statusColors]}>
          {t(STATUS_KEY[item.status])}
        </Text>
      </View>

      {item.status === "rejected" && item.rejectionReason && (
        <View style={styles.reason}>
          <Text variant="label">{t("submissions.rejectionReasonLabel")}</Text>
          <Text variant="bodySmall">{item.rejectionReason}</Text>
        </View>
      )}

      {item.status !== "approved" && <AuthorActions item={item} />}

      {liveRecipe ? (
        <Pressable
          accessibilityRole="link"
          hitSlop={8}
          onPress={() => router.push({ pathname: "/recipe/[id]", params: { id: liveRecipe.id } })}
        >
          <Text variant="label" style={styles.link}>
            {t("submissions.viewRecipe")}
          </Text>
        </Pressable>
      ) : item.status === "approved" ? (
        <Text variant="bodySmall" muted>
          {t("submissions.removedFromCatalog")}
        </Text>
      ) : null}
    </View>
  );
}

/** AC-6: edit and withdraw, for pending and rejected rows only. */
function AuthorActions({ item }: { item: MyRecipeSubmissionSummary }) {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const withdraw = useWithdrawRecipeSubmission();
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleWithdraw = async () => {
    setError(null);
    const result = await withdraw.mutateAsync(item.id);
    if (result.error) {
      setError(
        result.error.reason === "not_editable"
          ? t("submissions.errorNotEditable")
          : t("submissions.withdrawFailed"),
      );
      setIsConfirming(false);
    }
  };

  return (
    <View style={styles.actionsBlock}>
      {isConfirming ? (
        <>
          <Text variant="bodySmall" muted>
            {t("submissions.withdrawConfirm")}
          </Text>
          <View style={styles.actions}>
            <Button variant="secondary" onPress={() => setIsConfirming(false)}>
              {t("common.cancel")}
            </Button>
            <Button disabled={withdraw.isPending} onPress={handleWithdraw}>
              {withdraw.isPending ? t("submissions.withdrawing") : t("submissions.withdraw")}
            </Button>
          </View>
        </>
      ) : (
        <View style={styles.actions}>
          <Button
            onPress={() =>
              router.push({ pathname: "/my-recipes/[id]/edit", params: { id: item.id } })
            }
          >
            {item.status === "rejected" ? t("submissions.editAndResubmit") : t("submissions.edit")}
          </Button>
          <Button variant="secondary" onPress={() => setIsConfirming(true)}>
            {t("submissions.withdraw")}
          </Button>
        </View>
      )}
      {error && (
        <Text variant="bodySmall" style={{ color: theme.danger }} accessibilityRole="alert">
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.three,
    padding: Spacing.four,
  },
  centered: {
    alignItems: "center",
    paddingVertical: Spacing.six,
  },
  row: {
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: Radii.medium,
    padding: Spacing.three,
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.three,
  },
  thumbnail: {
    width: THUMBNAIL_SIZE,
    height: THUMBNAIL_SIZE,
    borderRadius: Radii.small,
    overflow: "hidden",
  },
  rowName: {
    flex: 1,
  },
  status: {
    borderRadius: Radii.full,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    overflow: "hidden",
  },
  reason: {
    gap: Spacing.half,
  },
  actionsBlock: {
    gap: Spacing.one,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
  },
  link: {
    textDecorationLine: "underline",
  },
});
