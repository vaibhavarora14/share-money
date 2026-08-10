import * as DocumentPicker from "expo-document-picker";
import React, { useMemo, useState } from "react";
import { Platform, ScrollView, StyleSheet, View } from "react-native";
import {
  ActivityIndicator,
  Appbar,
  Button,
  Card,
  Divider,
  Menu,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WEB_MAX_WIDTH } from "../constants/layout";
import { useAuth } from "../contexts/AuthContext";
import { createParticipant, fetchParticipants } from "../hooks/useParticipants";
import { useGroups } from "../hooks/useGroups";
import type { Group, Participant } from "../types";
import { trackGrowthEvent } from "../utils/analytics";
import { getUserFriendlyErrorMessage } from "../utils/errorMessages";
import { logError } from "../utils/logger";
import {
  parseSplitwiseExport,
  type SplitwiseParseResult,
} from "../utils/splitwise";
import type { PreparedSplitwiseImport } from "./SplitwiseImportScreen";

type MigrationMode = "new" | "existing";

interface SplitwiseMigrationScreenProps {
  onBack: () => void;
  onCreateGroup: (input: { name: string }) => Promise<Group>;
  onImportReady: (group: Group, preparedImport: PreparedSplitwiseImport) => void;
}

async function readAssetText(asset: DocumentPicker.DocumentPickerAsset): Promise<string> {
  if (Platform.OS === "web") {
    if (asset.file) return asset.file.text();
    const response = await fetch(asset.uri);
    return response.text();
  }

  const FileSystem = await import("expo-file-system/legacy");
  return FileSystem.readAsStringAsync(asset.uri);
}

function participantName(participant: Participant): string {
  return participant.full_name || participant.email || "You";
}

export function SplitwiseMigrationScreen({
  onBack,
  onCreateGroup,
  onImportReady,
}: SplitwiseMigrationScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { data: groups, isLoading: groupsLoading } = useGroups();
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<SplitwiseParseResult | null>(null);
  const [mode, setMode] = useState<MigrationMode>("new");
  const [groupName, setGroupName] = useState("Imported Splitwise group");
  const [selfIndex, setSelfIndex] = useState<number | null>(null);
  const [selfMenuOpen, setSelfMenuOpen] = useState(false);
  const [createdGroup, setCreatedGroup] = useState<Group | null>(null);
  const [preparedMapping, setPreparedMapping] = useState<(string | null)[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const importedItems = useMemo(
    () => (parsed?.expenses.length ?? 0) + (parsed?.payments.length ?? 0),
    [parsed],
  );

  const pickFile = async () => {
    setErrorMessage("");
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: Platform.OS === "android"
          ? "*/*"
          : ["text/csv", "text/comma-separated-values", "text/plain"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      const nextParsed = parseSplitwiseExport(await readAssetText(asset));
      if (nextParsed.expenses.length === 0 && nextParsed.payments.length === 0) {
        setErrorMessage("No importable expenses or payments were found in this file.");
        return;
      }

      setFileName(asset.name || "export.csv");
      setParsed(nextParsed);
      setSelfIndex(null);
      setCreatedGroup(null);
      setPreparedMapping([]);
      trackGrowthEvent("splitwise csv parsed", {
        expense_count: nextParsed.expenses.length,
        settlement_count: nextParsed.payments.length,
        skipped_count: nextParsed.skipped.length,
      });
    } catch (error) {
      logError(error, { context: "SplitwiseMigrationScreen.pickFile" });
      setErrorMessage(error instanceof Error ? error.message : "Could not read the selected file.");
    }
  };

  const openExistingGroup = (group: Group) => {
    if (!parsed) return;
    onImportReady(group, { fileName, parsed });
  };

  const prepareNewGroup = async () => {
    if (!parsed || selfIndex === null || !user?.id) return;
    if (!groupName.trim()) {
      setErrorMessage("Enter a group name before importing.");
      return;
    }

    setSubmitting(true);
    setErrorMessage("");
    try {
      trackGrowthEvent("migration started", { entry: "guided_import" });
      const group = createdGroup ?? await onCreateGroup({ name: groupName.trim() });
      setCreatedGroup(group);

      const participants = await fetchParticipants(group.id);
      const selfParticipant = participants.find((participant) => participant.user_id === user.id);
      if (!selfParticipant) {
        throw new Error("Your participant record was not ready. Please try again.");
      }

      const nextMapping = [...preparedMapping];
      for (let index = 0; index < parsed.people.length; index += 1) {
        if (nextMapping[index]) continue;

        if (index === selfIndex) {
          nextMapping[index] = selfParticipant.id;
        } else {
          const existing = participants.find((participant) =>
            !participant.user_id && participant.type === "member" &&
            participant.full_name === parsed.people[index] &&
            !nextMapping.includes(participant.id)
          );
          const participant = existing ?? await createParticipant({
            groupId: group.id,
            fullName: parsed.people[index],
          });
          nextMapping[index] = participant.id;
        }
        setPreparedMapping([...nextMapping]);
      }

      if (nextMapping.some((participantId) => !participantId)) {
        throw new Error("Every exported member must be matched before importing.");
      }

      trackGrowthEvent("migration mapping completed", {
        member_count: nextMapping.length,
        expense_count: parsed.expenses.length,
        settlement_count: parsed.payments.length,
      });
      onImportReady(group, { fileName, parsed, mapping: nextMapping as string[] });
    } catch (error) {
      logError(error, { context: "SplitwiseMigrationScreen.prepareNewGroup" });
      setErrorMessage(getUserFriendlyErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}>
      <Appbar.Header>
        <Appbar.BackAction onPress={onBack} disabled={submitting} />
        <Appbar.Content title="Move from Splitwise" />
      </Appbar.Header>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        {errorMessage ? (
          <Card mode="contained" style={[styles.card, { backgroundColor: theme.colors.errorContainer }]}>
            <Card.Content><Text style={{ color: theme.colors.onErrorContainer }}>{errorMessage}</Text></Card.Content>
          </Card>
        ) : null}

        <Card mode="outlined" style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.title}>1. Export your Splitwise group</Text>
            <Text variant="bodyMedium" style={styles.copy}>In Splitwise, open the group, choose group settings, then “Export as spreadsheet.” Your CSV stays on this device; SharedMoney only receives the confirmed import entries.</Text>
            <Button mode="contained" icon="file-upload-outline" onPress={pickFile} disabled={submitting} style={styles.button}>
              {parsed ? "Choose another CSV" : "Choose CSV file"}
            </Button>
            {parsed ? <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>{fileName}: {importedItems} items ready{parsed.skipped.length ? `, ${parsed.skipped.length} rows skipped` : ""}.</Text> : null}
          </Card.Content>
        </Card>

        {parsed ? (
          <>
            <Card mode="outlined" style={styles.card}>
              <Card.Content>
                <Text variant="titleMedium" style={styles.title}>2. Choose where to import</Text>
                <View style={styles.modeRow}>
                  <Button mode={mode === "new" ? "contained" : "outlined"} onPress={() => setMode("new")}>New group</Button>
                  <Button mode={mode === "existing" ? "contained" : "outlined"} onPress={() => setMode("existing")}>Existing group</Button>
                </View>
                {mode === "new" ? (
                  <>
                    <TextInput label="New group name" value={groupName} onChangeText={setGroupName} mode="outlined" disabled={submitting} style={styles.input} />
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Everyone else will be added as a person without an account. You can send an invite link after the import.</Text>
                  </>
                ) : (
                  <View style={styles.groupList}>
                    {groupsLoading ? <ActivityIndicator /> : groups.length === 0 ? <Text>You do not have an existing group yet.</Text> : groups.map((group) => <Button key={group.id} mode="outlined" onPress={() => openExistingGroup(group)} disabled={submitting}>{group.name}</Button>)}
                  </View>
                )}
              </Card.Content>
            </Card>

            {mode === "new" ? (
              <Card mode="outlined" style={styles.card}>
                <Card.Content>
                  <Text variant="titleMedium" style={styles.title}>3. Match yourself</Text>
                  <Text variant="bodyMedium" style={styles.copy}>Which exported name represents you? The remaining names become account-free people in the new group.</Text>
                  <Menu visible={selfMenuOpen} onDismiss={() => setSelfMenuOpen(false)} anchor={<Button mode="outlined" icon="account" onPress={() => setSelfMenuOpen(true)}>{selfIndex === null ? "Select your name" : parsed.people[selfIndex]}</Button>}>
                    {parsed.people.map((name, index) => <Menu.Item key={`${name}-${index}`} title={name} onPress={() => { setSelfIndex(index); setSelfMenuOpen(false); }} />)}
                  </Menu>
                  <Divider style={styles.divider} />
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Import limits: up to 2,000 items. Rows paid by multiple people can be skipped. Payment rows must be between two people. Currencies remain separate rather than being converted.</Text>
                  <Button mode="contained" icon="import" onPress={prepareNewGroup} disabled={selfIndex === null || submitting} loading={submitting} style={styles.button}>
                    Create group and review import
                  </Button>
                </Card.Content>
              </Card>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, width: "100%", maxWidth: WEB_MAX_WIDTH, alignSelf: "center" },
  content: { paddingHorizontal: 16, paddingTop: 16 },
  card: { marginBottom: 16 },
  title: { fontWeight: "700", marginBottom: 8 },
  copy: { marginBottom: 16, lineHeight: 21 },
  button: { marginTop: 16 },
  modeRow: { flexDirection: "row", gap: 8, marginBottom: 16, flexWrap: "wrap" },
  input: { marginBottom: 12 },
  groupList: { gap: 8 },
  divider: { marginTop: 16, marginBottom: 12 },
});
