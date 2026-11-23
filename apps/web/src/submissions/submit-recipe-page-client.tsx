"use client";

import { useId, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  buildRecipeSlugPath,
  normalizeRecipeNameForMatch,
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
  type SubmissionFormIngredient,
  type SubmissionValidationError,
} from "@bartendingapp/shared";
import { useSession } from "@/auth/use-session";
import { Link, useRouter } from "@/i18n/navigation";
import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { Input } from "@/components/input";
import { LinkButton } from "@/components/link-button";
import { Spinner } from "@/components/spinner";
import { Text } from "@/components/text";
import { alcoholicStatusKey } from "@/recipes/format";
import { SubmissionPhotoField } from "./submission-photo-field";
import { SubmissionSignInPrompt } from "./submission-sign-in-prompt";
import {
  useDuplicateRecipeNames,
  useMyRecipeSubmission,
  useSaveRecipeSubmission,
  useSubmissionFormContext,
  useSubmissionIngredientSuggestions,
  useSubmissionPhotoUrls,
  type SaveSubmissionWithPhotoResult,
  type SubmissionPhotoChange,
} from "./use-submissions";

type SubmissionsTranslator = ReturnType<typeof useTranslations<"submissions">>;

/**
 * /my-recipes/new, and /my-recipes/[id]/edit when `submissionId` is set
 * (spec 0064 AC-1 to AC-7, AC-13 reason, AC-18 state, AC-21 entry).
 */
export function SubmitRecipePageClient({ submissionId }: { submissionId?: string }) {
  const t = useTranslations("submissions");
  const { isLinked, isLoading } = useSession();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-four px-four py-six">
      <Text variant="display" as="h1">
        {submissionId ? t("editTitle") : t("submitTitle")}
      </Text>
      {isLoading ? (
        <FormSpinner label={t("loadingForm")} />
      ) : !isLinked ? (
        <SubmissionSignInPrompt />
      ) : submissionId ? (
        <EditSubmission submissionId={submissionId} />
      ) : (
        <NewSubmission />
      )}
    </div>
  );
}

function NewSubmission() {
  const t = useTranslations("submissions");
  const tCommon = useTranslations("common");
  const context = useSubmissionFormContext();

  if (context.isError) {
    return (
      <EmptyState
        title={tCommon("somethingWentWrong")}
        description={t("formLoadFailed")}
        action={<Button onClick={() => context.refetch()}>{tCommon("retry")}</Button>}
      />
    );
  }
  if (!context.data) return <FormSpinner label={t("loadingForm")} />;
  if (context.data.blocked) return <EmptyState title={t("errorBlocked")} />;
  return <SubmissionForm requireDisplayName={context.data.needsDisplayName} />;
}

function EditSubmission({ submissionId }: { submissionId: string }) {
  const t = useTranslations("submissions");
  const tCommon = useTranslations("common");
  const { data, isError, isPending, refetch } = useMyRecipeSubmission(submissionId);
  const backAction = <LinkButton href="/my-recipes">{t("backToMyRecipes")}</LinkButton>;

  if (isError) {
    return (
      <EmptyState
        title={tCommon("somethingWentWrong")}
        description={t("formLoadFailed")}
        action={<Button onClick={() => refetch()}>{tCommon("retry")}</Button>}
      />
    );
  }
  if (isPending) return <FormSpinner label={t("loadingForm")} />;
  if (data === null) return <EmptyState title={t("notFound")} action={backAction} />;
  // AC-6: an approved submission is read only.
  if (data.status === "approved") {
    return <EmptyState title={t("errorNotEditable")} action={backAction} />;
  }
  if (data.blocked) return <EmptyState title={t("errorBlocked")} action={backAction} />;

  return (
    <SubmissionForm
      key={data.updatedAt}
      requireDisplayName={data.needsDisplayName}
      existing={data}
    />
  );
}

function FormSpinner({ label }: { label: string }) {
  return (
    <div className="flex justify-center py-six">
      <Spinner label={label} />
    </div>
  );
}

function fieldError(
  t: SubmissionsTranslator,
  errors: readonly SubmissionValidationError[],
  field: "name" | "instructions" | "glass" | "note" | "displayName" | "alcoholicStatus",
): string | undefined {
  const match = errors.find((error) => error.field === field);
  if (!match) return undefined;
  if (match.reason === "required") return t("errorRequired");
  if (match.reason === "invalid") return t("errorInvalidStatus");
  switch (field) {
    case "name":
      return t("errorTooLong", { max: SUBMISSION_NAME_MAX_LENGTH });
    case "instructions":
      return t("errorTooLong", { max: SUBMISSION_INSTRUCTIONS_MAX_LENGTH });
    case "glass":
      return t("errorTooLong", { max: SUBMISSION_GLASS_MAX_LENGTH });
    case "note":
      return t("errorTooLong", { max: SUBMISSION_NOTE_MAX_LENGTH });
    default:
      return t("errorTooLong", { max: 50 });
  }
}

function ingredientsError(
  t: SubmissionsTranslator,
  errors: readonly SubmissionValidationError[],
): string | undefined {
  const match = errors.find(
    (error) =>
      error.field === "ingredients" && (error.reason === "required" || error.reason === "too_many"),
  );
  if (!match) return undefined;
  return match.reason === "too_many"
    ? t("errorTooManyIngredients", { max: SUBMISSION_MAX_INGREDIENTS })
    : t("errorIngredientsRequired");
}

function ingredientRowError(
  t: SubmissionsTranslator,
  errors: readonly SubmissionValidationError[],
  index: number,
  part: "name" | "measure",
): string | undefined {
  const match = errors.find(
    (error) =>
      error.field === "ingredients" &&
      "index" in error &&
      error.index === index &&
      (part === "measure"
        ? error.reason === "measure_too_long"
        : error.reason !== "measure_too_long"),
  );
  if (!match || !("index" in match)) return undefined;
  if (match.reason === "name_required") return t("errorRequired");
  return t("errorTooLong", {
    max: part === "measure" ? SUBMISSION_MEASURE_MAX_LENGTH : SUBMISSION_INGREDIENT_NAME_MAX_LENGTH,
  });
}

/** The server refusals that are not a field error, in the form's words. */
function saveErrorMessage(
  t: SubmissionsTranslator,
  error: NonNullable<SaveSubmissionWithPhotoResult["error"]>,
): string | null {
  switch (error.reason) {
    case "validation":
      return null;
    case "photo_failed":
      return error.upload.reason === "too_large" || error.upload.reason === "wrong_type"
        ? t("photoErrorUploadRejected")
        : t("photoUploadFailed");
    case "pending_cap":
      return t("errorPendingCap");
    case "daily_cap":
      return t("errorDailyCap");
    case "blocked":
      return t("errorBlocked");
    case "not_editable":
      return t("errorNotEditable");
    case "anonymous":
      return t("signInTitle");
    case "display_name_required":
      return t("errorDisplayNameRequired");
    case "invalid":
      return t("errorSaveFailed");
    case "request_failed":
      return t("errorSaveFailed");
  }
}

const emptyIngredient = (): SubmissionFormIngredient => ({ name: "", measure: "" });

function initialIngredients(existing?: MyRecipeSubmission): SubmissionFormIngredient[] {
  if (!existing || existing.ingredients.length === 0) return [emptyIngredient()];
  return existing.ingredients.map((i) => ({ name: i.name, measure: i.measure ?? "" }));
}

function SubmissionForm({
  requireDisplayName,
  existing,
}: {
  requireDisplayName: boolean;
  /** Set when editing a pending or rejected submission (AC-6). */
  existing?: MyRecipeSubmission;
}) {
  const t = useTranslations("submissions");
  const tCommon = useTranslations("common");
  const tStatus = useTranslations("alcoholicStatus");
  const locale = useLocale();
  const router = useRouter();
  const save = useSaveRecipeSubmission();
  // Generated once for a new submission, so a retried save updates the same
  // row instead of creating a second one, and names the photo path. An edit
  // keeps the existing id.
  const [submissionId] = useState(() => existing?.id ?? crypto.randomUUID());
  const [name, setName] = useState(existing?.name ?? "");
  const [ingredients, setIngredients] = useState(() => initialIngredients(existing));
  const [instructions, setInstructions] = useState(existing?.instructions ?? "");
  const [glass, setGlass] = useState(existing?.glass ?? "");
  const [alcoholicStatus, setAlcoholicStatus] = useState<string>(
    existing?.alcoholicStatus ?? "alcoholic",
  );
  const [note, setNote] = useState(existing?.note ?? "");
  // AC-8: keep, remove, or replace the one photo; uploaded only on save.
  const [photoChange, setPhotoChange] = useState<SubmissionPhotoChange>({ kind: "keep" });
  const currentPhotoPath = existing?.photoPath ?? null;
  const { data: photoUrls } = useSubmissionPhotoUrls([currentPhotoPath], "card");
  const currentPhotoUrl = currentPhotoPath ? (photoUrls?.[currentPhotoPath] ?? null) : null;
  const [displayName, setDisplayName] = useState("");
  const [errors, setErrors] = useState<SubmissionValidationError[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  // AC-7: the duplicate warning, after typing pauses and again on submit.
  const duplicates = useDuplicateRecipeNames(name);
  const [submitMatches, setSubmitMatches] = useState<{
    name: string;
    matches: RecipeSearchResult[];
  } | null>(null);
  // The name a warning was last shown for, so a second submit goes through.
  const [warnedName, setWarnedName] = useState<string | null>(null);
  const typedKey = normalizeRecipeNameForMatch(name);
  const visibleMatches =
    submitMatches && normalizeRecipeNameForMatch(submitMatches.name) === typedKey
      ? submitMatches.matches
      : normalizeRecipeNameForMatch(duplicates.checkedName) === typedKey
        ? duplicates.matches
        : [];

  // A warning already on screen for this name lets the submit go through.
  const alreadyWarned = visibleMatches.length > 0 || warnedName === typedKey;

  // AC-1: catalog names for the focused ingredient row; free text still allowed.
  const ingredientListId = useId();
  const [activeIngredientIndex, setActiveIngredientIndex] = useState<number | null>(null);
  const activeIngredientQuery =
    activeIngredientIndex === null ? "" : (ingredients[activeIngredientIndex]?.name ?? "");
  const { data: ingredientSuggestions = [] } =
    useSubmissionIngredientSuggestions(activeIngredientQuery);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
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
      setFormError(saveErrorMessage(t, result.error));
      return;
    }

    setErrors([]);
    router.push("/my-recipes");
  }

  const isSaving = save.isPending;
  const listError = ingredientsError(t, errors);

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-four" noValidate>
      {existing?.status === "rejected" && existing.rejectionReason && (
        <div className="flex flex-col gap-half rounded-medium border border-danger p-three">
          <Text variant="label">{t("rejectedNotice")}</Text>
          {/* Plain text only (invariant 8). */}
          <Text variant="bodySmall" className="whitespace-pre-line break-words">
            {existing.rejectionReason}
          </Text>
        </div>
      )}

      <div className="flex flex-col gap-one">
        <Input
          label={t("name")}
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={fieldError(t, errors, "name")}
          maxLength={SUBMISSION_NAME_MAX_LENGTH}
          autoComplete="off"
          required
        />
        {visibleMatches.length > 0 && (
          <div role="status" className="flex flex-col gap-half">
            <Text variant="bodySmall">{t("duplicateWarning")}</Text>
            <ul className="flex flex-col gap-half">
              {visibleMatches.map((recipe) => (
                <li key={recipe.id}>
                  <Link
                    href={`/recipes/${buildRecipeSlugPath(recipe.id, recipe.name, recipe.baseName)}`}
                    target="_blank"
                    className="text-body-small font-medium underline underline-offset-4"
                  >
                    {recipe.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <fieldset className="flex flex-col gap-two">
        <legend className="contents">
          <Text variant="label">{t("ingredients")}</Text>
        </legend>
        {listError && (
          <span role="alert" className="text-body-small text-danger">
            {listError}
          </span>
        )}
        {ingredients.map((ingredient, index) => (
          <div key={index} className="flex flex-wrap items-end gap-two sm:flex-nowrap">
            <Input
              label={t("ingredientName", { number: index + 1 })}
              value={ingredient.name}
              list={ingredientListId}
              onFocus={() => setActiveIngredientIndex(index)}
              onChange={(event) =>
                setIngredients((current) =>
                  current.map((row, i) =>
                    i === index ? { ...row, name: event.target.value } : row,
                  ),
                )
              }
              error={ingredientRowError(t, errors, index, "name")}
              maxLength={SUBMISSION_INGREDIENT_NAME_MAX_LENGTH}
              autoComplete="off"
              className="min-w-0"
            />
            <Input
              label={t("measure", { number: index + 1 })}
              value={ingredient.measure}
              onChange={(event) =>
                setIngredients((current) =>
                  current.map((row, i) =>
                    i === index ? { ...row, measure: event.target.value } : row,
                  ),
                )
              }
              error={ingredientRowError(t, errors, index, "measure")}
              maxLength={SUBMISSION_MEASURE_MAX_LENGTH}
              autoComplete="off"
              className="min-w-0"
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIngredients((current) => current.filter((_, i) => i !== index))}
              disabled={ingredients.length === 1}
            >
              {tCommon("remove")}
            </Button>
          </div>
        ))}
        <datalist id={ingredientListId}>
          {ingredientSuggestions.map((suggestion) => (
            <option key={suggestion.id} value={suggestion.name} />
          ))}
        </datalist>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setIngredients((current) => [...current, emptyIngredient()])}
          disabled={ingredients.length >= SUBMISSION_MAX_INGREDIENTS}
          className="self-start"
        >
          {t("addIngredient")}
        </Button>
      </fieldset>

      <TextArea
        id="submission-instructions"
        label={t("instructions")}
        value={instructions}
        onChange={setInstructions}
        maxLength={SUBMISSION_INSTRUCTIONS_MAX_LENGTH}
        rows={6}
        error={fieldError(t, errors, "instructions")}
      />

      <Input
        label={t("glass")}
        value={glass}
        onChange={(event) => setGlass(event.target.value)}
        error={fieldError(t, errors, "glass")}
        maxLength={SUBMISSION_GLASS_MAX_LENGTH}
        autoComplete="off"
      />

      <div className="flex flex-col gap-one">
        <label htmlFor="submission-alcoholic-status" className="text-label font-medium text-text">
          {t("alcoholicStatus")}
        </label>
        <select
          id="submission-alcoholic-status"
          value={alcoholicStatus}
          onChange={(event) => setAlcoholicStatus(event.target.value)}
          className="rounded-small border border-border bg-surface px-three py-two text-body text-text"
        >
          {SUBMISSION_ALCOHOLIC_STATUSES.map((status) => (
            <option key={status} value={status}>
              {tStatus(alcoholicStatusKey(status))}
            </option>
          ))}
        </select>
      </div>

      <TextArea
        id="submission-note"
        label={t("note")}
        hint={t("noteHint", { max: SUBMISSION_NOTE_MAX_LENGTH })}
        value={note}
        onChange={setNote}
        maxLength={SUBMISSION_NOTE_MAX_LENGTH}
        rows={3}
        error={fieldError(t, errors, "note")}
      />

      <SubmissionPhotoField
        currentUrl={currentPhotoUrl}
        hasCurrent={currentPhotoPath !== null}
        change={photoChange}
        onChange={setPhotoChange}
        disabled={isSaving}
      />

      {requireDisplayName && (
        <Input
          label={t("displayName")}
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          error={fieldError(t, errors, "displayName")}
          maxLength={50}
          autoComplete="nickname"
          required
        />
      )}

      <Text variant="bodySmall" muted>
        {t("publicNameNotice")}
      </Text>

      {formError && (
        <Text variant="bodySmall" role="alert" className="text-danger">
          {formError}
        </Text>
      )}

      <Button type="submit" disabled={isSaving} className="self-start">
        {isSaving ? t("submitting") : existing ? t("resubmit") : t("submit")}
      </Button>
    </form>
  );
}

function TextArea({
  id,
  label,
  hint,
  value,
  onChange,
  maxLength,
  rows,
  error,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  rows: number;
  error?: string;
}) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(" ");
  return (
    <div className="flex flex-col gap-one">
      <label htmlFor={id} className="text-label font-medium text-text">
        {label}
      </label>
      {hint && (
        <Text id={`${id}-hint`} variant="bodySmall" muted>
          {hint}
        </Text>
      )}
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={maxLength}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={`rounded-small border bg-surface px-three py-two text-body text-text ${
          error ? "border-danger" : "border-border"
        }`}
      />
      {error && (
        <span id={`${id}-error`} role="alert" className="text-body-small text-danger">
          {error}
        </span>
      )}
    </div>
  );
}
