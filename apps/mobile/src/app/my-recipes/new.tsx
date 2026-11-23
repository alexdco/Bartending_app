import { useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { parseRecipeSubmissionFormEntry } from "@bartendingapp/shared";

import { withMocktailsHidden } from "@/mocktails/with-mocktails-hidden";
import { NewSubmission } from "@/submissions/submission-form";
import { SubmissionScreen } from "@/submissions/submission-screen";

// Spec 0064 AC-1: submit a recipe. `from=search` marks the search prompt entry.
function SubmitRecipeScreen() {
  const { t } = useTranslation();
  const { from } = useLocalSearchParams<{ from?: string }>();

  return (
    <SubmissionScreen title={t("submissions.submitTitle")}>
      <NewSubmission entry={parseRecipeSubmissionFormEntry(from)} />
    </SubmissionScreen>
  );
}

// Hidden in mocktails only mode (spec 0064 AC-20).
export default withMocktailsHidden(SubmitRecipeScreen);
