import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { randomUUID } from "expo-crypto";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  buildRecipeSubmissionFormOpenedEvent,
  buildRecipeSubmissionSavedEvent,
  normalizeRecipeNameForMatch,
  submissionFieldMessage,
  submissionHasPhotoAfterSave,
  submissionIngredientRowMessage,
  submissionIngredientsMessage,
  submissionSaveMessage,
  SUBMISSION_ALCOHOLIC_STATUSES,
  SUBMISSION_GLASS_MAX_LENGTH,
  SUBMISSION_INGREDIENT_NAME_MAX_LENGTH,
  SUBMISSION_INSTRUCTIONS_MAX_LENGTH,
  SUBMISSION_MAX_INGREDIENTS,
  SUBMISSION_MEASURE_MAX_LENGTH,
  SUBMISSION_NAME_MAX_LENGTH,
  SUBMISSION_NOTE_MAX_LENGTH,
  type MyRecipeSubmission,
  type RecipeSearchResult,
  type RecipeSubmissionFormEntry,
  type SubmissionFormIngredient,
  type SubmissionMessage,
  type SubmissionPhotoChange,
  type SubmissionValidationError,
} from "@bartendingapp/shared";

import { track } from "@/analytics/posthog-client";
import { Button } from "@/components/button";
import { Chip } from "@/components/chip";
import { EmptyState } from "@/components/empty-state";
import { Input } from "@/components/input";
import { Spinner } from "@/components/spinner";
import { Text } from "@/components/text";
import { Radii, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useActiveLocale } from "@/i18n";
import { useIngredientSearch } from "@/pantry/use-ingredient-search";
import { SubmissionPhotoField } from "./submission-photo-field";
import {
  useDuplicateRecipeNames,
  useMyRecipeSubmission,
  useSaveRecipeSubmission,
  useSubmissionFormContext,
  useSubmissionPhotoUrls,
} from "./use-submissions";

const ALCOHOLIC_STATUS_KEY: Record<string, string> = {
  alcoholic: "alcoholicStatus.alcoholic",
  non_alcoholic: "alcoholicStatus.nonAlcoholic",
  optional: "alcoholicStatus.optional",
};

/** A shared submission message (spec 0064), in this locale. */
function message(t: TFunction, value: SubmissionMessage | null): string | undefined {
  return value ? t(`submissions.${value.key}`, value.values) : undefined;
}

function Centered({ label }: { label: string }) {
  return (
    <View style={styles.centered}>
      <Spinner label={label} />
    </View>
  );
}

/** The new submission form (AC-1 to AC-5, AC-7, AC-8, AC-18). */
export function NewSubmission({ entry }: { entry: RecipeSubmissionFormEntry }) {
  const { t } = useTranslation();
  const context = useSubmissionFormContext();
  const ready = context.data !== undefined && !context.data.blocked;

  // Fires once the form itself shows, like web.
  useEffect(() => {
    if (!ready) return;
    const event = buildRecipeSubmissionFormOpenedEvent({ entry });
    track(event.name, event.properties);
  }, [ready, entry]);

  if (context.isError) {
    return (
      <EmptyState
        title={t("common.somethingWentWrong")}
        description={t("submissions.formLoadFailed")}
        action={<Button onPress={() => context.refetch()}>{t("common.retry")}</Button>}
      />
    );
  }
  if (!context.data) return <Centered label={t("submissions.loadingForm")} />;
  if (context.data.blocked) return <EmptyState title={t("submissions.errorBlocked")} />;
  return <SubmissionForm requireDisplayName={context.data.needsDisplayName} />;
}

/** Editing a pending or rejected submission; approved ones are read only (AC-6, AC-13). */
export function EditSubmission({ submissionId }: { submissionId: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { data, isError, isPending, refetch } = useMyRecipeSubmission(submissionId);
  const backAction = (
    <Button variant="secondary" onPress={() => router.replace("/my-recipes")}>
      {t("submissions.backToMyRecipes")}
    </Button>
  );

  if (isError) {
    return (
      <EmptyState
        title={t("common.somethingWentWrong")}
        description={t("submissions.formLoadFailed")}
        action={<Button onPress={() => refetch()}>{t("common.retry")}</Button>}
      />
    );
  }
  if (isPending) return <Centered label={t("submissions.loadingForm")} />;
  if (data === null) return <EmptyState title={t("submissions.notFound")} action={backAction} />;
  if (data.status === "approved") {
    return <EmptyState title={t("submissions.errorNotEditable")} action={backAction} />;
  }
  if (data.blocked) {
    return <EmptyState title={t("submissions.errorBlocked")} action={backAction} />;
  }

  return (
    <SubmissionForm
      key={data.updatedAt}
      requireDisplayName={data.needsDisplayName}
      existing={data}
    />
  );
}

const emptyIngredient = (): SubmissionFormIngredient => ({ name: "", measure: "" });

function initialIngredients(existing?: MyRecipeSubmission): SubmissionFormIngredient[] {
  if (!existing || existing.ingredients.length === 0) return [emptyIngredient()];
  return existing.ingredients.map((i) => ({ name: i.name, measure: i.measure ?? "" }));
}

const INGREDIENT_SUGGESTION_MIN_CHARS = 2;
const INGREDIENT_SUGGESTION_LIMIT = 6;

/** Catalog names for the focused row; free text still saves (AC-1). */
function IngredientSuggestions({
  query,
  onPick,
}: {
  query: string;
  onPick: (name: string) => void;
}) {
  const theme = useTheme();
  const trimmed = query.trim();
  const { data = [] } = useIngredientSearch(trimmed, { includeStaples: true });
  const suggestions = data
    .filter((ingredient) => ingredient.name.toLowerCase() !== trimmed.toLowerCase())
    .slice(0, INGREDIENT_SUGGESTION_LIMIT);

  if (trimmed.length < INGREDIENT_SUGGESTION_MIN_CHARS || suggestions.length === 0) return null;

  return (
    <View
      style={[styles.suggestions, { borderColor: theme.border, backgroundColor: theme.surface }]}
    >
      {suggestions.map((ingredient) => (
        <Pressable
          key={ingredient.id}
          accessibilityRole="button"
          style={styles.suggestion}
          onPress={() => onPick(ingredient.name)}
        >
          <Text variant="body">{ingredient.name}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function SubmissionForm({
  requireDisplayName,
  existing,
}: {
  requireDisplayName: boolean;
  existing?: MyRecipeSubmission;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  const locale = useActiveLocale();
  const router = useRouter();
  const save = useSaveRecipeSubmission();
  // Generated once for a new submission, so a retried save updates the same
  // row and names the photo path. An edit keeps the existing id.
  const [submissionId] = useState(() => existing?.id ?? randomUUID());
  const [name, setName] = useState(existing?.name ?? "");
  const [ingredients, setIngredients] = useState(() => initialIngredients(existing));
  const [instructions, setInstructions] = useState(existing?.instructions ?? "");
  const [glass, setGlass] = useState(existing?.glass ?? "");
  const [alcoholicStatus, setAlcoholicStatus] = useState<string>(
    existing?.alcoholicStatus ?? "alcoholic",
  );
  const [note, setNote] = useState(existing?.note ?? "");
  const [photoChange, setPhotoChange] = useState<SubmissionPhotoChange>({ kind: "keep" });
  const currentPhotoPath = existing?.photoPath ?? null;
  const { data: photoUrls } = useSubmissionPhotoUrls([currentPhotoPath], "card");
  const currentPhotoUrl = currentPhotoPath ? (photoUrls?.[currentPhotoPath] ?? null) : null;
  const [displayName, setDisplayName] = useState("");
  const [errors, setErrors] = useState<readonly SubmissionValidationError[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [activeIngredientIndex, setActiveIngredientIndex] = useState<number | null>(null);

  // AC-7: the duplicate warning, after typing pauses and again on submit.
  const duplicates = useDuplicateRecipeNames(name);
  const [submitMatches, setSubmitMatches] = useState<{
    name: string;
    matches: RecipeSearchResult[];
  } | null>(null);
  const [warnedName, setWarnedName] = useState<string | null>(null);
  const typedKey = normalizeRecipeNameForMatch(name);
  const visibleMatches =
    submitMatches && normalizeRecipeNameForMatch(submitMatches.name) === typedKey
      ? submitMatches.matches
      : normalizeRecipeNameForMatch(duplicates.checkedName) === typedKey
        ? duplicates.matches
        : [];
  const alreadyWarned = visibleMatches.length > 0 || warnedName === typedKey;

  const updateIngredient = (index: number, patch: Partial<SubmissionFormIngredient>) =>
    setIngredients((current) =>
      current.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );

  const handleSubmit = async () => {
    setFormError(null);

    if (typedKey.length > 0 && !alreadyWarned) {
      const matches = await duplicates.checkNow(name).catch(() => []);
      if (matches.length > 0) {
        // Shown once; submitting again is still allowed.
        setSubmitMatches({ name, matches });
        setWarnedName(typedKey);
        return;
      }
    }

    const result = await save.mutateAsync({
      id: submissionId,
      locale,
      requireDisplayName,
      currentPhotoPath,
      photo: photoChange,
      values: { name, ingredients, instructions, glass, alcoholicStatus, note, displayName },
    });

    if (result.error) {
      setErrors(result.error.reason === "validation" ? result.error.errors : []);
      setFormError(message(t, submissionSaveMessage(result.error)) ?? null);
      return;
    }

    setErrors([]);
    const savedEvent = buildRecipeSubmissionSavedEvent({
      is_resubmit: existing !== undefined,
      has_photo: submissionHasPhotoAfterSave(currentPhotoPath, photoChange),
      locale: existing?.locale ?? locale,
    });
    track(savedEvent.name, savedEvent.properties);
    router.replace("/my-recipes");
  };

  const isSaving = save.isPending;
  const listError = message(t, submissionIngredientsMessage(errors));

  return (
    <View style={styles.form}>
      {existing?.status === "rejected" && existing.rejectionReason && (
        <View style={[styles.notice, { borderColor: theme.danger }]}>
          <Text variant="label">{t("submissions.rejectedNotice")}</Text>
          {/* Plain text only (invariant 8). */}
          <Text variant="bodySmall">{existing.rejectionReason}</Text>
        </View>
      )}

      <View style={styles.group}>
        <Input
          label={t("submissions.name")}
          value={name}
          onChangeText={setName}
          error={message(t, submissionFieldMessage(errors, "name"))}
          maxLength={SUBMISSION_NAME_MAX_LENGTH}
          autoCorrect={false}
        />
        {visibleMatches.length > 0 && (
          <View style={styles.group} accessibilityLiveRegion="polite">
            <Text variant="bodySmall">{t("submissions.duplicateWarning")}</Text>
            {visibleMatches.map((recipe) => (
              <Pressable
                key={recipe.id}
                accessibilityRole="link"
                onPress={() => router.push({ pathname: "/recipe/[id]", params: { id: recipe.id } })}
              >
                <Text variant="label" style={styles.link}>
                  {recipe.name}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      <View style={styles.group}>
        <Text variant="subheading">{t("submissions.ingredients")}</Text>
        {listError && (
          <Text variant="bodySmall" style={{ color: theme.danger }} accessibilityRole="alert">
            {listError}
          </Text>
        )}
        {ingredients.map((ingredient, index) => (
          <View key={index} style={[styles.ingredientRow, { borderColor: theme.border }]}>
            <Input
              label={t("submissions.ingredientName", { number: index + 1 })}
              value={ingredient.name}
              onFocus={() => setActiveIngredientIndex(index)}
              onChangeText={(value) => updateIngredient(index, { name: value })}
              error={message(t, submissionIngredientRowMessage(errors, index, "name"))}
              maxLength={SUBMISSION_INGREDIENT_NAME_MAX_LENGTH}
              autoCorrect={false}
            />
            {activeIngredientIndex === index && (
              <IngredientSuggestions
                query={ingredient.name}
                onPick={(picked) => {
                  updateIngredient(index, { name: picked });
                  setActiveIngredientIndex(null);
                }}
              />
            )}
            <Input
              label={t("submissions.measure", { number: index + 1 })}
              value={ingredient.measure}
              onFocus={() => setActiveIngredientIndex(null)}
              onChangeText={(value) => updateIngredient(index, { measure: value })}
              error={message(t, submissionIngredientRowMessage(errors, index, "measure"))}
              maxLength={SUBMISSION_MEASURE_MAX_LENGTH}
            />
            <Button
              variant="secondary"
              disabled={ingredients.length === 1}
              onPress={() => {
                setActiveIngredientIndex(null);
                setIngredients((current) => current.filter((_, i) => i !== index));
              }}
            >
              {t("common.remove")}
            </Button>
          </View>
        ))}
        <Button
          variant="secondary"
          disabled={ingredients.length >= SUBMISSION_MAX_INGREDIENTS}
          onPress={() => setIngredients((current) => [...current, emptyIngredient()])}
        >
          {t("submissions.addIngredient")}
        </Button>
      </View>

      <Input
        label={t("submissions.instructions")}
        value={instructions}
        onChangeText={setInstructions}
        error={message(t, submissionFieldMessage(errors, "instructions"))}
        maxLength={SUBMISSION_INSTRUCTIONS_MAX_LENGTH}
        multiline
        textAlignVertical="top"
        style={styles.multilineLarge}
      />

      <Input
        label={t("submissions.glass")}
        value={glass}
        onChangeText={setGlass}
        error={message(t, submissionFieldMessage(errors, "glass"))}
        maxLength={SUBMISSION_GLASS_MAX_LENGTH}
      />

      <View style={styles.group}>
        <Text variant="label">{t("submissions.alcoholicStatus")}</Text>
        <View style={styles.chips}>
          {SUBMISSION_ALCOHOLIC_STATUSES.map((status) => (
            <Chip
              key={status}
              selected={alcoholicStatus === status}
              onSelectedChange={() => setAlcoholicStatus(status)}
            >
              {t(ALCOHOLIC_STATUS_KEY[status] ?? "alcoholicStatus.unknown")}
            </Chip>
          ))}
        </View>
        {submissionFieldMessage(errors, "alcoholicStatus") && (
          <Text variant="bodySmall" style={{ color: theme.danger }} accessibilityRole="alert">
            {message(t, submissionFieldMessage(errors, "alcoholicStatus"))}
          </Text>
        )}
      </View>

      <View style={styles.group}>
        <Input
          label={t("submissions.note")}
          value={note}
          onChangeText={setNote}
          error={message(t, submissionFieldMessage(errors, "note"))}
          maxLength={SUBMISSION_NOTE_MAX_LENGTH}
          multiline
          textAlignVertical="top"
          style={styles.multilineSmall}
        />
        <Text variant="bodySmall" muted>
          {t("submissions.noteHint", { max: SUBMISSION_NOTE_MAX_LENGTH })}
        </Text>
      </View>

      <SubmissionPhotoField
        currentUrl={currentPhotoUrl}
        hasCurrent={currentPhotoPath !== null}
        change={photoChange}
        onChange={setPhotoChange}
        disabled={isSaving}
      />

      {requireDisplayName && (
        <Input
          label={t("submissions.displayName")}
          value={displayName}
          onChangeText={setDisplayName}
          error={message(t, submissionFieldMessage(errors, "displayName"))}
          maxLength={50}
          autoComplete="nickname"
        />
      )}

      <Text variant="bodySmall" muted>
        {t("submissions.publicNameNotice")}
      </Text>

      {formError && (
        <Text
          variant="bodySmall"
          style={{ color: theme.danger }}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          {formError}
        </Text>
      )}

      <Button disabled={isSaving} onPress={handleSubmit}>
        {isSaving
          ? t("submissions.submitting")
          : existing
            ? t("submissions.resubmit")
            : t("submissions.submit")}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: Spacing.four,
  },
  group: {
    gap: Spacing.two,
  },
  centered: {
    alignItems: "center",
    paddingVertical: Spacing.six,
  },
  notice: {
    gap: Spacing.one,
    borderWidth: 1,
    borderRadius: Radii.medium,
    padding: Spacing.three,
  },
  link: {
    textDecorationLine: "underline",
  },
  ingredientRow: {
    gap: Spacing.two,
    paddingBottom: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  suggestions: {
    borderWidth: 1,
    borderRadius: Radii.small,
  },
  suggestion: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: Spacing.three,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
  },
  multilineLarge: {
    minHeight: 140,
    paddingTop: Spacing.two,
  },
  multilineSmall: {
    minHeight: 88,
    paddingTop: Spacing.two,
  },
});
