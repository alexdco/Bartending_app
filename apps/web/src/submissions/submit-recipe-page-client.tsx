"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  SUBMISSION_ALCOHOLIC_STATUSES,
  SUBMISSION_GLASS_MAX_LENGTH,
  SUBMISSION_INGREDIENT_NAME_MAX_LENGTH,
  SUBMISSION_INSTRUCTIONS_MAX_LENGTH,
  SUBMISSION_MAX_INGREDIENTS,
  SUBMISSION_MEASURE_MAX_LENGTH,
  SUBMISSION_NAME_MAX_LENGTH,
  SUBMISSION_NOTE_MAX_LENGTH,
  type SaveRecipeSubmissionResult,
  type SubmissionFormIngredient,
  type SubmissionValidationError,
} from "@bartendingapp/shared";
import { useSession } from "@/auth/use-session";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { Input } from "@/components/input";
import { Spinner } from "@/components/spinner";
import { Text } from "@/components/text";
import { alcoholicStatusKey } from "@/recipes/format";
import { SubmissionSignInPrompt } from "./submission-sign-in-prompt";
import { useSaveRecipeSubmission, useSubmissionFormContext } from "./use-submissions";

type SubmissionsTranslator = ReturnType<typeof useTranslations<"submissions">>;

/** /my-recipes/new (spec 0064 AC-1 to AC-5, AC-18 state, AC-21 entry). */
export function SubmitRecipePageClient() {
  const t = useTranslations("submissions");
  const tCommon = useTranslations("common");
  const { isLinked, isLoading } = useSession();
  const context = useSubmissionFormContext();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-four px-four py-six">
      <Text variant="display" as="h1">
        {t("submitTitle")}
      </Text>
      {isLoading ? (
        <FormSpinner label={t("loadingForm")} />
      ) : !isLinked ? (
        <SubmissionSignInPrompt />
      ) : context.isError ? (
        <EmptyState
          title={tCommon("somethingWentWrong")}
          description={t("formLoadFailed")}
          action={<Button onClick={() => context.refetch()}>{tCommon("retry")}</Button>}
        />
      ) : !context.data ? (
        <FormSpinner label={t("loadingForm")} />
      ) : context.data.blocked ? (
        <EmptyState title={t("errorBlocked")} />
      ) : (
        <SubmissionForm requireDisplayName={context.data.needsDisplayName} />
      )}
    </div>
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
  error: NonNullable<SaveRecipeSubmissionResult["error"]>,
): string | null {
  switch (error.reason) {
    case "validation":
      return null;
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

function SubmissionForm({ requireDisplayName }: { requireDisplayName: boolean }) {
  const t = useTranslations("submissions");
  const tCommon = useTranslations("common");
  const tStatus = useTranslations("alcoholicStatus");
  const locale = useLocale();
  const router = useRouter();
  const save = useSaveRecipeSubmission();
  // Generated once, so a retried save updates the same row instead of
  // creating a second one (and, from task 7, names the photo path).
  const [submissionId] = useState(() => crypto.randomUUID());
  const [name, setName] = useState("");
  const [ingredients, setIngredients] = useState<SubmissionFormIngredient[]>([emptyIngredient()]);
  const [instructions, setInstructions] = useState("");
  const [glass, setGlass] = useState("");
  const [alcoholicStatus, setAlcoholicStatus] = useState<string>("alcoholic");
  const [note, setNote] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [errors, setErrors] = useState<SubmissionValidationError[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const result = await save.mutateAsync({
      id: submissionId,
      locale,
      requireDisplayName,
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
      <Input
        label={t("name")}
        value={name}
        onChange={(event) => setName(event.target.value)}
        error={fieldError(t, errors, "name")}
        maxLength={SUBMISSION_NAME_MAX_LENGTH}
        autoComplete="off"
        required
      />

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
        {isSaving ? t("submitting") : t("submit")}
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
