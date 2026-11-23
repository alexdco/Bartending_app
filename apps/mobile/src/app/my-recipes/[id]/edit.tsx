import { useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";

import { withMocktailsHidden } from "@/mocktails/with-mocktails-hidden";
import { EditSubmission } from "@/submissions/submission-form";
import { SubmissionScreen } from "@/submissions/submission-screen";

// Spec 0064 AC-6: edit and resubmit a pending or rejected submission.
function EditRecipeSubmissionScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <SubmissionScreen title={t("submissions.editTitle")}>
      <EditSubmission submissionId={id} />
    </SubmissionScreen>
  );
}

// Hidden in mocktails only mode (spec 0064 AC-20).
export default withMocktailsHidden(EditRecipeSubmissionScreen);
