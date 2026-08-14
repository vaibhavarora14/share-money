import React from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import {
  Button,
  RadioButton,
  Surface,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import { ReportReason, SafetyTarget } from "../hooks/useModeration";

export type SafetyAction = "report" | "block";

interface SafetyActionModalProps {
  action: SafetyAction | null;
  target: SafetyTarget | null;
  submitting: boolean;
  onDismiss: () => void;
  onReport: (reason: ReportReason, details: string) => Promise<void>;
  onBlock: () => Promise<void>;
}

const reasons: Array<{ value: ReportReason; label: string }> = [
  { value: "spam", label: "Spam or misleading" },
  { value: "harassment", label: "Harassment or bullying" },
  { value: "hate_speech", label: "Hate speech" },
  { value: "sexual_content", label: "Sexual content" },
  { value: "violence", label: "Violence or threats" },
  { value: "other", label: "Something else" },
];

export const SafetyActionModal: React.FC<SafetyActionModalProps> = ({
  action,
  target,
  submitting,
  onDismiss,
  onReport,
  onBlock,
}) => {
  const theme = useTheme();
  const [reason, setReason] = React.useState<ReportReason>("harassment");
  const [details, setDetails] = React.useState("");

  React.useEffect(() => {
    if (action) {
      setReason("harassment");
      setDetails("");
    }
  }, [action, target?.contentId]);

  if (!target || !action) return null;

  const isReport = action === "report";
  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="formSheet"
      onRequestClose={onDismiss}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        <Surface style={styles.sheet} elevation={0}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text variant="headlineSmall" style={styles.title}>
              {isReport ? "Report this activity" : `Block ${target.targetName} everywhere?`}
            </Text>

            {isReport ? (
              <>
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                  Your report will be sent to the SharedMoney team for review.
                </Text>
                <RadioButton.Group
                  value={reason}
                  onValueChange={(value) => setReason(value as ReportReason)}
                >
                  <View style={styles.reasonList}>
                    {reasons.map((item) => (
                      <RadioButton.Item
                        key={item.value}
                        label={item.label}
                        value={item.value}
                        disabled={submitting}
                      />
                    ))}
                  </View>
                </RadioButton.Group>
                <TextInput
                  mode="outlined"
                  label="Additional details (optional)"
                  value={details}
                  onChangeText={setDetails}
                  multiline
                  maxLength={1000}
                  disabled={submitting}
                  style={styles.details}
                />
              </>
            ) : (
              <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant }}>
                Their activity will disappear from all of your SharedMoney feeds immediately.
                Shared financial records and balances will remain intact. SharedMoney will also
                receive a safety report so the triggering activity can be reviewed.
              </Text>
            )}

            <View style={styles.actions}>
              <Button mode="text" onPress={onDismiss} disabled={submitting}>
                Cancel
              </Button>
              <Button
                mode="contained"
                buttonColor={!isReport ? theme.colors.error : undefined}
                loading={submitting}
                disabled={submitting}
                onPress={() => isReport ? onReport(reason, details) : onBlock()}
              >
                {isReport ? "Submit report" : "Block user"}
              </Button>
            </View>
          </ScrollView>
        </Surface>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  sheet: {
    flex: 1,
  },
  content: {
    gap: 20,
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  title: {
    fontWeight: "700",
  },
  reasonList: {
    marginHorizontal: -8,
  },
  details: {
    minHeight: 96,
  },
  actions: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 8,
  },
});
