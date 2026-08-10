import * as DocumentPicker from "expo-document-picker";
import * as Crypto from "expo-crypto";
import React, { useEffect, useMemo, useState } from "react";
import {
    BackHandler,
    Platform,
    ScrollView,
    StyleSheet,
    View,
} from "react-native";
import {
    ActivityIndicator,
    Appbar,
    Button,
    Card,
    Chip,
    Divider,
    Menu,
    Text,
    useTheme,
} from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WEB_MAX_WIDTH } from "../constants/layout";
import { useParticipants } from "../hooks/useParticipants";
import {
    SplitwiseImportResult,
    useSplitwiseImport,
} from "../hooks/useSplitwiseImport";
import { Participant } from "../types";
import { getUserFriendlyErrorMessage } from "../utils/errorMessages";
import { logError } from "../utils/logger";
import { trackGrowthEvent } from "../utils/analytics";
import {
    autoMatchPeopleToParticipants,
    parseSplitwiseExport,
    SplitwiseParseResult,
} from "../utils/splitwise";

interface SplitwiseImportScreenProps {
  groupId: string;
  groupName: string;
  onBack: () => void;
  /** Called after a successful import (navigates back to the group). */
  onDone: () => void;
}

type ImportStep = "pick" | "map" | "done";

async function readAssetText(
  asset: DocumentPicker.DocumentPickerAsset
): Promise<string> {
  if (Platform.OS === "web") {
    if (asset.file) {
      return await asset.file.text();
    }
    const response = await fetch(asset.uri);
    return await response.text();
  }
  const FileSystem = await import("expo-file-system/legacy");
  return await FileSystem.readAsStringAsync(asset.uri);
}

function getParticipantLabel(participant: Participant): string {
  const name =
    participant.full_name ||
    participant.email ||
    `Person ${participant.id.substring(0, 8)}`;
  if (participant.type === "former") return `${name} (Former)`;
  return name;
}

export const SplitwiseImportScreen: React.FC<SplitwiseImportScreenProps> = ({
  groupId,
  groupName,
  onBack,
  onDone,
}) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<ImportStep>("pick");
  const [fileName, setFileName] = useState<string>("");
  const [parsed, setParsed] = useState<SplitwiseParseResult | null>(null);
  // participant id (or null) per Splitwise member, indexed like parsed.people
  const [mapping, setMapping] = useState<(string | null)[]>([]);
  const [openMenuIndex, setOpenMenuIndex] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [importId, setImportId] = useState<string | null>(null);
  const [importResult, setImportResult] =
    useState<SplitwiseImportResult | null>(null);

  const { data: participants, isLoading: participantsLoading } =
    useParticipants(groupId);
  const importMutation = useSplitwiseImport();
  const importing = importMutation.isLoading;

  // Android hardware back mirrors the appbar back action
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (importing) return true; // don't leave mid-import
        onBack();
        return true;
      }
    );
    return () => subscription.remove();
  }, [onBack, importing]);

  const handlePickFile = async () => {
    setErrorMessage("");
    try {
      const result = await DocumentPicker.getDocumentAsync({
        // Android content providers report CSVs under many mime types, so
        // filtering there tends to grey out valid files.
        type:
          Platform.OS === "android"
            ? "*/*"
            : ["text/csv", "text/comma-separated-values", "text/plain"],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const asset = result.assets[0];
      const text = await readAssetText(asset);
      const parseResult = parseSplitwiseExport(text);

      if (
        parseResult.expenses.length === 0 &&
        parseResult.payments.length === 0
      ) {
        setErrorMessage(
          "No importable expenses or payments were found in this file."
        );
        return;
      }

      setFileName(asset.name || "export.csv");
      setParsed(parseResult);
      setImportId(null);
      setMapping(
        autoMatchPeopleToParticipants(parseResult.people, participants || [])
      );
      trackGrowthEvent("splitwise csv parsed", {
        expense_count: parseResult.expenses.length,
        settlement_count: parseResult.payments.length,
        skipped_count: parseResult.skipped.length,
      });
      setStep("map");
    } catch (err) {
      logError(err, { context: "SplitwiseImportScreen.pickFile" });
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Could not read the selected file."
      );
    }
  };

  const handleResetFile = () => {
    setParsed(null);
    setMapping([]);
    setFileName("");
    setImportId(null);
    setErrorMessage("");
    setStep("pick");
  };

  const duplicateParticipantIds = useMemo(() => {
    const counts = new Map<string, number>();
    mapping.forEach((id) => {
      if (id) counts.set(id, (counts.get(id) || 0) + 1);
    });
    return new Set(
      Array.from(counts.entries())
        .filter(([, count]) => count > 1)
        .map(([id]) => id)
    );
  }, [mapping]);

  const unmappedCount = useMemo(
    () => mapping.filter((id) => !id).length,
    [mapping]
  );

  const mappingValid =
    mapping.length > 0 && unmappedCount === 0 && duplicateParticipantIds.size === 0;

  const handleImport = async () => {
    if (!parsed || !mappingValid) return;
    setErrorMessage("");
    const nextImportId = importId ?? Crypto.randomUUID();
    setImportId(nextImportId);

    const expenses = parsed.expenses.map((expense) => ({
      description: expense.description,
      date: expense.date,
      category: expense.category,
      currency: expense.currency,
      amount: expense.amount,
      paid_by_participant_id: mapping[expense.payerIndex] as string,
      splits: expense.shares.map((share) => ({
        participant_id: mapping[share.personIndex] as string,
        amount: share.amount,
      })),
    }));

    const settlements = parsed.payments.map((payment) => ({
      from_participant_id: mapping[payment.fromIndex] as string,
      to_participant_id: mapping[payment.toIndex] as string,
      amount: payment.amount,
      currency: payment.currency,
      notes: `Imported from Splitwise (${payment.date})`,
    }));

    try {
      trackGrowthEvent("migration mapping completed", {
        member_count: mapping.length,
        expense_count: expenses.length,
        settlement_count: settlements.length,
      });
      const result = await importMutation.mutate({
        import_id: nextImportId,
        group_id: groupId,
        expenses,
        settlements,
      });
      setImportResult(result);
      trackGrowthEvent("migration completed", {
        expense_count: result.imported_expenses,
        settlement_count: result.imported_settlements,
        duplicate: result.duplicate,
      });
      if (result.activated) {
        trackGrowthEvent("group activated", { method: "splitwise_import" });
      }
      setStep("done");
    } catch (err) {
      logError(err, { context: "SplitwiseImportScreen.import" });
      setErrorMessage(getUserFriendlyErrorMessage(err));
    }
  };

  const renderPickStep = () => (
    <>
      <Card mode="outlined" style={styles.card}>
        <Card.Content>
          <Text variant="titleMedium" style={styles.cardTitle}>
            How to export from Splitwise
          </Text>
          <Text variant="bodyMedium" style={styles.instructionLine}>
            1. Open your group in Splitwise
          </Text>
          <Text variant="bodyMedium" style={styles.instructionLine}>
            2. Go to group settings and choose "Export as spreadsheet"
          </Text>
          <Text variant="bodyMedium" style={styles.instructionLine}>
            3. Save the CSV file, then pick it below
          </Text>
          <Text
            variant="bodySmall"
            style={[
              styles.instructionNote,
              { color: theme.colors.onSurfaceVariant },
            ]}
          >
            Expenses and settle-up payments are imported into "{groupName}"
            with their original amounts and dates. Make sure everyone from the
            Splitwise group has been added to this group first.
          </Text>
        </Card.Content>
      </Card>

      <Button
        mode="contained"
        icon="file-upload-outline"
        onPress={handlePickFile}
        disabled={participantsLoading}
        style={styles.primaryButton}
        testID="splitwise-pick-file-button"
      >
        Choose CSV file
      </Button>
    </>
  );

  const renderMappingRow = (person: string, index: number) => {
    const selectedId = mapping[index];
    const selectedParticipant = (participants || []).find(
      (p) => p.id === selectedId
    );
    const isDuplicate = !!selectedId && duplicateParticipantIds.has(selectedId);

    return (
      <View key={`${person}-${index}`}>
        {index > 0 && <Divider />}
        <View style={styles.mappingRow}>
          <View style={styles.mappingName}>
            <Text variant="bodyLarge" numberOfLines={1}>
              {person}
            </Text>
            <Text
              variant="bodySmall"
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              Splitwise member
            </Text>
          </View>
          <Menu
            visible={openMenuIndex === index}
            onDismiss={() => setOpenMenuIndex(null)}
            anchor={
              <Button
                mode="outlined"
                onPress={() => setOpenMenuIndex(index)}
                icon="chevron-down"
                contentStyle={styles.mappingButtonContent}
                textColor={
                  isDuplicate
                    ? theme.colors.error
                    : selectedParticipant
                      ? undefined
                      : theme.colors.onSurfaceVariant
                }
                testID={`splitwise-mapping-${index}`}
              >
                {selectedParticipant
                  ? getParticipantLabel(selectedParticipant)
                  : "Select member"}
              </Button>
            }
          >
            {(participants || []).map((participant) => (
              <Menu.Item
                key={participant.id}
                title={getParticipantLabel(participant)}
                onPress={() => {
                  setMapping((current) => {
                    const next = [...current];
                    next[index] = participant.id;
                    return next;
                  });
                  setOpenMenuIndex(null);
                }}
                trailingIcon={
                  selectedId === participant.id ? "check" : undefined
                }
              />
            ))}
          </Menu>
        </View>
      </View>
    );
  };

  const renderMapStep = () => {
    if (!parsed) return null;

    return (
      <>
        <View style={styles.fileRow}>
          <Chip icon="file-delimited-outline" onPress={handleResetFile}>
            {fileName}
          </Chip>
          <Button compact mode="text" onPress={handleResetFile}>
            Change file
          </Button>
        </View>

        <Card mode="outlined" style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.cardTitle}>
              Match members
            </Text>
            <Text
              variant="bodySmall"
              style={[
                styles.instructionNote,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              Match each Splitwise member to a member of this group. Missing
              someone? Go back and add them to the group first.
            </Text>
            {parsed.people.map(renderMappingRow)}
            {duplicateParticipantIds.size > 0 && (
              <Text
                variant="bodySmall"
                style={[styles.validationText, { color: theme.colors.error }]}
              >
                Each Splitwise member must be matched to a different group
                member.
              </Text>
            )}
            {unmappedCount > 0 && (
              <Text
                variant="bodySmall"
                style={[
                  styles.validationText,
                  { color: theme.colors.onSurfaceVariant },
                ]}
              >
                {unmappedCount} member{unmappedCount === 1 ? "" : "s"} still
                need{unmappedCount === 1 ? "s" : ""} a match.
              </Text>
            )}
          </Card.Content>
        </Card>

        <Card mode="outlined" style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.cardTitle}>
              Ready to import
            </Text>
            <Text variant="bodyMedium" style={styles.instructionLine}>
              {parsed.expenses.length} expense
              {parsed.expenses.length === 1 ? "" : "s"}
            </Text>
            <Text variant="bodyMedium" style={styles.instructionLine}>
              {parsed.payments.length} settle-up payment
              {parsed.payments.length === 1 ? "" : "s"}
            </Text>
            {parsed.skipped.length > 0 && (
              <>
                <Text
                  variant="bodyMedium"
                  style={[
                    styles.instructionLine,
                    { color: theme.colors.error },
                  ]}
                >
                  {parsed.skipped.length} row
                  {parsed.skipped.length === 1 ? "" : "s"} will be skipped:
                </Text>
                {parsed.skipped.slice(0, 10).map((skippedRow) => (
                  <Text
                    key={skippedRow.line}
                    variant="bodySmall"
                    style={[
                      styles.skippedLine,
                      { color: theme.colors.onSurfaceVariant },
                    ]}
                  >
                    Line {skippedRow.line}: "{skippedRow.description}"{" "}
                    {skippedRow.reason}
                  </Text>
                ))}
                {parsed.skipped.length > 10 && (
                  <Text
                    variant="bodySmall"
                    style={[
                      styles.skippedLine,
                      { color: theme.colors.onSurfaceVariant },
                    ]}
                  >
                    …and {parsed.skipped.length - 10} more
                  </Text>
                )}
              </>
            )}
          </Card.Content>
        </Card>

        <Button
          mode="contained"
          icon="import"
          onPress={handleImport}
          disabled={!mappingValid || importing}
          loading={importing}
          style={styles.primaryButton}
          testID="splitwise-import-button"
        >
          {importing
            ? "Importing…"
            : `Import ${parsed.expenses.length + parsed.payments.length} items`}
        </Button>
      </>
    );
  };

  const renderDoneStep = () => (
    <>
      <Card mode="outlined" style={styles.card}>
        <Card.Content style={styles.doneContent}>
          <Text variant="headlineSmall" style={styles.doneTitle}>
            Import complete
          </Text>
          <Text variant="bodyMedium" style={styles.instructionLine}>
            {importResult?.imported_expenses ?? 0} expense
            {importResult?.imported_expenses === 1 ? "" : "s"} and{" "}
            {importResult?.imported_settlements ?? 0} settlement
            {importResult?.imported_settlements === 1 ? "" : "s"} were added to
            "{groupName}".
          </Text>
          {parsed && parsed.skipped.length > 0 && (
            <Text
              variant="bodySmall"
              style={[
                styles.instructionNote,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              {parsed.skipped.length} row
              {parsed.skipped.length === 1 ? " was" : "s were"} skipped.
            </Text>
          )}
        </Card.Content>
      </Card>

      <Button
        mode="contained"
        onPress={onDone}
        style={styles.primaryButton}
        testID="splitwise-done-button"
      >
        Done
      </Button>
    </>
  );

  return (
    <View
      style={[
        styles.rootContainer,
        { backgroundColor: theme.colors.background, paddingTop: insets.top },
      ]}
    >
      <Appbar.Header>
        <Appbar.BackAction
          onPress={step === "done" ? onDone : onBack}
          disabled={importing}
        />
        <Appbar.Content title="Import from Splitwise" />
      </Appbar.Header>

      {participantsLoading && step === "pick" ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + 24 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {errorMessage.length > 0 && (
            <Card
              mode="contained"
              style={[
                styles.card,
                { backgroundColor: theme.colors.errorContainer },
              ]}
            >
              <Card.Content>
                <Text
                  variant="bodyMedium"
                  style={{ color: theme.colors.onErrorContainer }}
                >
                  {errorMessage}
                </Text>
              </Card.Content>
            </Card>
          )}

          {step === "pick" && renderPickStep()}
          {step === "map" && renderMapStep()}
          {step === "done" && renderDoneStep()}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    width: "100%",
    maxWidth: WEB_MAX_WIDTH,
    alignSelf: "center",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  card: {
    marginBottom: 16,
  },
  cardTitle: {
    marginBottom: 8,
    fontWeight: "600",
  },
  instructionLine: {
    marginBottom: 4,
  },
  instructionNote: {
    marginTop: 8,
    marginBottom: 8,
  },
  skippedLine: {
    marginBottom: 2,
  },
  validationText: {
    marginTop: 8,
  },
  primaryButton: {
    marginTop: 4,
  },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  mappingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    gap: 8,
  },
  mappingName: {
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  mappingButtonContent: {
    flexDirection: "row-reverse",
  },
  doneContent: {
    alignItems: "flex-start",
  },
  doneTitle: {
    marginBottom: 8,
    fontWeight: "600",
  },
});
