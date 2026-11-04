"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  LOCALE_NATIVE_NAME,
  setRecipeTranslationNotes,
  type AdminTranslationNotes,
  type NonDefaultLocale,
} from "@bartendingapp/shared";
import { Button } from "@/components/button";
import { Text } from "@/components/text";
import { supabase } from "@/lib/supabase";
import { NoteField } from "./note-field";

interface TranslationNotesSectionProps {
  recipeId: string;
  locale: NonDefaultLocale;
  notes: AdminTranslationNotes | null;
}

/**
 * One locale's style and tips, saved on its own so the save touches only that
 * locale's row, never the English fields (spec 0045 AC-11).
 */
export function TranslationNotesSection({ recipeId, locale, notes }: TranslationNotesSectionProps) {
  const t = useTranslations("admin");
  const language = LOCALE_NATIVE_NAME[locale];
  const [drinkStyleNote, setDrinkStyleNote] = useState(notes?.drink_style_note ?? "");
  const [bartenderTip, setBartenderTip] = useState(notes?.bartender_tip ?? "");
  const [presentationTip, setPresentationTip] = useState(notes?.presentation_tip ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  async function handleSave() {
    setIsSaving(true);
    setMessage(null);

    const { error } = await setRecipeTranslationNotes(supabase, recipeId, locale, {
      drink_style_note: drinkStyleNote,
      bartender_tip: bartenderTip,
      presentation_tip: presentationTip,
    });

    setIsSaving(false);

    if (!error) {
      setMessage({ text: t("translationNotesSaved"), isError: false });
    } else if (error.reason === "too_long") {
      setMessage({ text: t("errorNoteTooLong"), isError: true });
    } else if (error.reason === "no_translation_row") {
      setMessage({ text: t("errorNoTranslationRow", { language }), isError: true });
    } else {
      setMessage({
        text: t("translationNotesSaveFailed", { message: error.message }),
        isError: true,
      });
    }
  }

  return (
    <fieldset className="flex flex-col gap-three">
      <legend className="contents">
        <Text variant="label">{t("translationNotesHeading", { language })}</Text>
      </legend>
      <Text variant="bodySmall" muted>
        {t("translationNotesHint")}
      </Text>

      <NoteField
        id={`${locale}-drinkStyleNote`}
        label={t("drinkStyleNote")}
        value={drinkStyleNote}
        onChange={setDrinkStyleNote}
        error={undefined}
      />
      <NoteField
        id={`${locale}-bartenderTip`}
        label={t("bartenderTip")}
        value={bartenderTip}
        onChange={setBartenderTip}
        error={undefined}
      />
      <NoteField
        id={`${locale}-presentationTip`}
        label={t("presentationTip")}
        value={presentationTip}
        onChange={setPresentationTip}
        error={undefined}
      />

      {message && (
        <Text
          variant="bodySmall"
          className={message.isError ? "text-danger" : undefined}
          muted={!message.isError}
          role="status"
        >
          {message.text}
        </Text>
      )}

      <Button
        type="button"
        variant="secondary"
        onClick={handleSave}
        disabled={isSaving}
        className="self-start"
      >
        {isSaving ? t("saving") : t("saveTranslationNotes", { language })}
      </Button>
    </fieldset>
  );
}
