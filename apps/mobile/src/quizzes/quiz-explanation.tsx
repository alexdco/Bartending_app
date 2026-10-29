import { StyleSheet } from "react-native";
import {
  splitExplanationAtAnchor,
  type QuizQuestion,
  type QuizQuestionSource,
} from "@bartendingapp/shared";

import { Text } from "@/components/text";
import { useTheme } from "@/hooks/use-theme";

export interface QuizExplanationProps {
  question: QuizQuestion;
  onSourcePress: (source: QuizQuestionSource) => void;
}

// Spec 0042 AC-1 to AC-3: the anchor phrase inside the explanation becomes
// a pressable link to the source; with no usable anchor a "Read more" line
// carries it; with no viewable source the explanation renders as before.
// The link text keeps the primary text color (a verified contrast pair on
// a card) with an accent underline.
export function QuizExplanation({ question, onSourcePress }: QuizExplanationProps) {
  const theme = useTheme();
  const { source, explanation } = question;

  if (!source) {
    return explanation ? (
      <Text variant="bodySmall" muted>
        {explanation}
      </Text>
    ) : null;
  }

  const linkStyle = [styles.link, { color: theme.text, textDecorationColor: theme.accent }];
  const handlePress = () => onSourcePress(source);
  const split = splitExplanationAtAnchor(explanation, question.sourceAnchor);

  if (split) {
    return (
      <Text variant="bodySmall" muted>
        {split.before}
        <Text variant="bodySmall" accessibilityRole="link" onPress={handlePress} style={linkStyle}>
          {split.match}
        </Text>
        {split.after}
      </Text>
    );
  }

  return (
    <>
      {explanation && (
        <Text variant="bodySmall" muted>
          {explanation}
        </Text>
      )}
      <Text variant="bodySmall" muted>
        Read more:{" "}
        <Text variant="bodySmall" accessibilityRole="link" onPress={handlePress} style={linkStyle}>
          {source.kind === "article" ? source.title : source.name}
        </Text>
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  link: {
    textDecorationLine: "underline",
  },
});
