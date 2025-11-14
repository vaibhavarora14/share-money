import React, { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import {
  ActivityIndicator,
  Appbar,
  Button,
  Card,
  FAB,
  IconButton,
  Menu,
  Text,
  useTheme,
} from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../contexts/AuthContext";
import { GroupInvitation, GroupWithMembers, Transaction, Balance, Settlement } from "../types";
import { getDefaultCurrency, formatCurrency } from "../utils/currency";
import { getUserFriendlyErrorMessage } from "../utils/errorMessages";
import { MembersList } from "../components/MembersList";
import { InvitationsList } from "../components/InvitationsList";
import { TransactionsSection } from "../components/TransactionsSection";
import { BalancesSection } from "../components/BalancesSection";
import { TransactionFormScreen } from "./TransactionFormScreen";
import { useDeleteGroup, useRemoveMember, useAddMember } from "../hooks/useGroupMutations";
import { useCancelInvitation, useGroupInvitations } from "../hooks/useGroupInvitations";
import { useGroupDetails } from "../hooks/useGroups";
import { 
  useTransactions,
  useCreateTransaction,
  useUpdateTransaction,
  useDeleteTransaction
} from "../hooks/useTransactions";
import { useBalances } from "../hooks/useBalances";
import { useSettlements, useCreateSettlement, useUpdateSettlement, useDeleteSettlement } from "../hooks/useSettlements";
import { SettlementFormScreen } from "./SettlementFormScreen";

interface GroupDetailsScreenProps {
  group: GroupWithMembers;
  onBack: () => void;
  onAddMember: () => void;
  onRemoveMember?: (userId: string) => Promise<void>;
  onLeaveGroup?: () => void;
  onDeleteGroup?: () => void;
  onTransactionAdded?: () => void;
  refreshTrigger?: number; // When this changes, refresh invitations
  groupRefreshTrigger?: number; // When this changes, refresh group data
}

export const GroupDetailsScreen: React.FC<GroupDetailsScreenProps> = ({
  group: initialGroup,
  onBack,
  onAddMember,
  onRemoveMember,
  onLeaveGroup,
  onDeleteGroup,
  onTransactionAdded,
  refreshTrigger,
  groupRefreshTrigger,
}) => {
  const [leaving, setLeaving] = useState<boolean>(false);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [menuVisible, setMenuVisible] = useState<boolean>(false);
  const [showTransactionForm, setShowTransactionForm] =
    useState<boolean>(false);
  const [editingTransaction, setEditingTransaction] =
    useState<Transaction | null>(null);
  const [showSettlementForm, setShowSettlementForm] = useState<boolean>(false);
  const [settlingBalance, setSettlingBalance] = useState<Balance | null>(null);
  const [editingSettlement, setEditingSettlement] = useState<Settlement | null>(null);
  // Fetch data with hooks
  const { data: groupData, isLoading: groupLoading, error: groupError, refetch: refetchGroup } = useGroupDetails(initialGroup.id);
  const { data: txData, isLoading: txLoading, refetch: refetchTx } = useTransactions(initialGroup.id);
  const { data: invitations = [] as GroupInvitation[], isLoading: invitationsLoading, refetch: refetchInvites } = useGroupInvitations(initialGroup.id);
  const { data: balancesData, isLoading: balancesLoading, refetch: refetchBalances } = useBalances(initialGroup.id);
  const { data: settlementsData, isLoading: settlementsLoading, refetch: refetchSettlements } = useSettlements(initialGroup.id);
  const [cancellingInvitationId, setCancellingInvitationId] = useState<
    string | null
  >(null);
  const [membersExpanded, setMembersExpanded] = useState<boolean>(false);
  const [settlementsExpanded, setSettlementsExpanded] = useState<boolean>(false);
  const { session, signOut } = useAuth();
  const theme = useTheme();
  
  // Refetch all data function
  const refetchAll = () => {
    console.log('[GroupDetailsScreen] refetchAll called');
    refetchTx();
    refetchBalances();
    refetchSettlements();
  };
  
  // Mutations
  const createTx = useCreateTransaction(refetchAll);
  const updateTx = useUpdateTransaction(() => refetchAll());
  const deleteTx = useDeleteTransaction(refetchAll);
  const deleteGroupMutation = useDeleteGroup(refetchGroup);
  const addMemberMutation = useAddMember(() => {
    refetchGroup();
    refetchInvites();
  });
  const removeMemberMutation = useRemoveMember(() => {
    refetchGroup();
    refetchInvites();
  });
  const cancelInvite = useCancelInvitation(refetchInvites);
  const createSettlement = useCreateSettlement(refetchAll);
  const updateSettlement = useUpdateSettlement(refetchAll);
  const deleteSettlement = useDeleteSettlement(refetchAll);

  // Use groupData directly, fallback to initialGroup while loading
  const group = groupData || initialGroup;
  
  // API already filters by group_id, so no need for client-side filtering
  const transactions = txData;

  // Refresh invitations when refreshTrigger changes (e.g., after adding a member)
  useEffect(() => {
    if (refreshTrigger !== undefined && refreshTrigger > 0) {
      refetchInvites();
    }
  }, [refreshTrigger, refetchInvites]);

  // Refresh group data when groupRefreshTrigger changes (e.g., after adding/removing a member)
  useEffect(() => {
    if (groupRefreshTrigger !== undefined && groupRefreshTrigger > 0) {
      refetchGroup();
    }
  }, [groupRefreshTrigger, refetchGroup]);

  const handleDeleteGroup = async () => {
    Alert.alert(
      "Delete Group",
      `Are you sure you want to delete "${group.name}"? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              setLeaving(true);
              await deleteGroupMutation.mutate(group.id);
              if (onDeleteGroup) {
                onDeleteGroup();
              } else {
                onBack();
              }
            } catch (err) {
              Alert.alert(
                "Error",
                getUserFriendlyErrorMessage(err)
              );
            } finally {
              setLeaving(false);
              setMenuVisible(false);
            }
          },
        },
      ]
    );
  };

  const handleLeaveGroup = async () => {
    Alert.alert(
      "Leave Group",
      `Are you sure you want to leave "${group.name}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Leave",
          style: "destructive",
          onPress: async () => {
            const currentUserId = session?.user?.id;
            if (!currentUserId) {
              Alert.alert("Error", "Unable to identify user");
              return;
            }

            try {
              setLeaving(true);
              await removeMemberMutation.mutate({
                groupId: group.id,
                userId: currentUserId,
              });
              // Call the onLeaveGroup callback if provided, otherwise just go back
              if (onLeaveGroup) {
                onLeaveGroup();
              } else {
                onBack();
              }
            } catch (err) {
              const errorMessage = getUserFriendlyErrorMessage(err);
              
              // Show user-friendly error messages for specific cases
              if (errorMessage.includes("last owner")) {
                Alert.alert(
                  "Cannot Leave Group",
                  "You cannot leave the group because you are the last owner. Please transfer ownership to another member first or delete the group.",
                  [{ text: "OK" }]
                );
                return;
              }

              Alert.alert("Error", errorMessage);
            } finally {
              setLeaving(false);
              setMenuVisible(false);
            }
          },
        },
      ]
    );
  };


  const handleCreateTransaction = async (
    transactionData: Omit<Transaction, "id" | "created_at" | "user_id">
  ): Promise<void> => {
    await createTx.mutate({
      ...transactionData,
      group_id: group.id,
      currency: transactionData.currency || getDefaultCurrency(),
    });
  };

  const handleUpdateTransaction = async (
    transactionData: Omit<Transaction, "id" | "created_at" | "user_id">
  ): Promise<void> => {
    if (!editingTransaction) throw new Error("Invalid request");
    await updateTx.mutate({
      ...transactionData,
      id: editingTransaction.id,
      currency: transactionData.currency || getDefaultCurrency(),
    });
  };

  const handleDeleteTransaction = async (transactionId: number): Promise<void> => {
    await deleteTx.mutate({ id: transactionId, group_id: group.id });
  };

  const handleRemoveMember = async (
    memberUserId: string,
    memberEmail?: string
  ) => {
    const memberName = memberEmail || `User ${memberUserId.substring(0, 8)}...`;
    const isRemovingSelf = memberUserId === session?.user?.id;
    const ownerCount =
      group.members?.filter((m) => m.role === "owner").length || 0;
    const memberToRemove = group.members?.find(
      (m) => m.user_id === memberUserId
    );
    const isRemovingOwner = memberToRemove?.role === "owner";

    // Check if trying to remove the last owner
    if (isRemovingOwner && ownerCount === 1) {
      Alert.alert(
        "Cannot Remove Member",
        "Cannot remove the last owner of the group. Please transfer ownership first or delete the group."
      );
      return;
    }

    Alert.alert(
      isRemovingSelf ? "Leave Group" : "Remove Member",
      isRemovingSelf
        ? `Are you sure you want to leave "${group.name}"?`
        : `Are you sure you want to remove "${memberName}" from this group?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: isRemovingSelf ? "Leave" : "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              setRemovingMemberId(memberUserId);
              // Use the local mutation which will refetch group data
              await removeMemberMutation.mutate({
                groupId: group.id,
                userId: memberUserId,
              });
              // If removing self, navigate back
              if (isRemovingSelf && onLeaveGroup) {
                onLeaveGroup();
              }
            } catch (error) {
              Alert.alert(
                "Error",
                getUserFriendlyErrorMessage(error)
              );
            } finally {
              setRemovingMemberId(null);
            }
          },
        },
      ]
    );
  };

  const handleEditTransaction = (transaction: Transaction) => {
    setEditingTransaction(transaction);
    setShowTransactionForm(true);
  };

  const handleTransactionFormSave = async (
    transactionData: Omit<Transaction, "id" | "created_at" | "user_id">
  ) => {
    if (editingTransaction) {
      await handleUpdateTransaction(transactionData);
    } else {
      await handleCreateTransaction(transactionData);
    }
  };

  const handleSettleUp = (balance: Balance) => {
    setSettlingBalance(balance);
    setShowSettlementForm(true);
  };

  const handleSettlementSave = async (settlementData: {
    group_id: string;
    from_user_id: string;
    to_user_id: string;
    amount: number;
    currency: string;
    notes?: string;
  }) => {
    await createSettlement.mutate(settlementData);
    setShowSettlementForm(false);
    setSettlingBalance(null);
  };

  const handleSettlementUpdate = async (updateData: {
    id: string;
    amount?: number;
    currency?: string;
    notes?: string;
  }) => {
    await updateSettlement.mutate(updateData);
    setShowSettlementForm(false);
    setEditingSettlement(null);
  };

  const handleEditSettlement = (settlement: Settlement) => {
    setEditingSettlement(settlement);
    setShowSettlementForm(true);
  };

  const handleDeleteSettlement = async (settlement: Settlement) => {
    Alert.alert(
      "Delete Settlement",
      `Are you sure you want to delete this settlement of ${formatCurrency(settlement.amount, settlement.currency || getDefaultCurrency())}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteSettlement.mutate({
                id: settlement.id,
                groupId: settlement.group_id,
              });
            } catch (err) {
              Alert.alert("Error", getUserFriendlyErrorMessage(err));
            }
          },
        },
      ]
    );
  };

  const currentUserId = session?.user?.id;
  const isOwner = Boolean(
    currentUserId &&
    (group.created_by === currentUserId ||
      group.members?.some(
        (m) => m.user_id === currentUserId && m.role === "owner"
      ))
  );
  const isMember = group.members?.some((m) => m.user_id === currentUserId) ?? false;

  // Memoize isOwner to prevent unnecessary re-renders
  const memoizedIsOwner = React.useMemo(
    () => isOwner,
    [
      group.created_by,
      currentUserId,
      group.members?.length,
      group.members?.find(
        (m) => m.user_id === currentUserId && m.role === "owner"
      )?.id,
    ]
  );

  const handleCancelInvitation = async (invitationId: string) => {
    Alert.alert(
      "Cancel Invitation",
      "Are you sure you want to cancel this invitation?",
      [
        { text: "No", style: "cancel" },
        {
          text: "Yes",
          style: "destructive",
          onPress: async () => {
            try {
              setCancellingInvitationId(invitationId);
              await cancelInvite.mutate({
                invitationId,
                groupId: group.id,
              });
            } catch (err) {
              Alert.alert(
                "Error",
                getUserFriendlyErrorMessage(err)
              );
            } finally {
              setCancellingInvitationId(null);
            }
          },
        },
      ]
    );
  };

  if (groupLoading && !group.members) {
    return (
      <View
        style={[
          styles.centerContainer,
          { backgroundColor: theme.colors.background },
        ]}
      >
        <ActivityIndicator size="large" />
        <Text variant="bodyLarge" style={{ marginTop: 16 }}>
          Loading group details...
        </Text>
      </View>
    );
  }

  if (groupError) {
    return (
      <View
        style={[
          styles.centerContainer,
          { backgroundColor: theme.colors.background },
        ]}
      >
        <Text
          variant="headlineSmall"
          style={{ color: theme.colors.error, marginBottom: 16 }}
        >
          Error
        </Text>
        <Text
          variant="bodyMedium"
          style={{ marginBottom: 24, textAlign: "center" }}
        >
          {getUserFriendlyErrorMessage(groupError)}
        </Text>
        <Button mode="contained" onPress={() => { void refetchGroup(); }}>
          Retry
        </Button>
      </View>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={["top", "bottom"]}
    >
      <Appbar.Header>
        <Appbar.BackAction onPress={onBack} />
        <Appbar.Content title={group.name} />
        {isMember && (
          <Menu
            visible={menuVisible}
            onDismiss={() => setMenuVisible(false)}
            anchor={
              <Appbar.Action
                icon="dots-vertical"
                onPress={() => setMenuVisible(true)}
              />
            }
          >
            {isOwner && (
              <Menu.Item
                onPress={() => {
                  setMenuVisible(false);
                  handleDeleteGroup();
                }}
                title="Delete Group"
                leadingIcon="delete"
                titleStyle={{ color: theme.colors.error }}
                disabled={leaving}
              />
            )}
            {!isOwner && (
              <Menu.Item
                onPress={() => {
                  setMenuVisible(false);
                  handleLeaveGroup();
                }}
                title="Leave Group"
                leadingIcon="exit-run"
                titleStyle={{ color: theme.colors.error }}
                disabled={leaving}
              />
            )}
            {isOwner && (
              <Menu.Item
                onPress={() => {
                  setMenuVisible(false);
                  handleLeaveGroup();
                }}
                title="Leave Group"
                leadingIcon="exit-run"
                titleStyle={{ color: theme.colors.error }}
                disabled={leaving}
              />
            )}
          </Menu>
        )}
      </Appbar.Header>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {group.description && (
          <Card style={styles.descriptionCard} mode="outlined">
            <Card.Content>
              <Text variant="bodyMedium">{group.description}</Text>
            </Card.Content>
          </Card>
        )}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Pressable
              style={styles.sectionTitleRow}
              onPress={() => setMembersExpanded(!membersExpanded)}
            >
              <IconButton
                icon={membersExpanded ? "chevron-down" : "chevron-right"}
                size={20}
                iconColor={theme.colors.onSurface}
                onPress={() => setMembersExpanded(!membersExpanded)}
                style={styles.expandButton}
              />
              <Text variant="titleMedium" style={styles.sectionTitle}>
                Members ({(group.members?.length || 0) + invitations.length})
              </Text>
            </Pressable>
            {memoizedIsOwner && (
              <IconButton
                icon="plus"
                size={20}
                iconColor={theme.colors.primary}
                onPress={onAddMember}
              />
            )}
          </View>

          {membersExpanded && (
            <>
              <MembersList
                members={group.members || []}
                currentUserId={session?.user?.id}
                isOwner={isOwner}
                removingMemberId={removingMemberId}
                onRemove={handleRemoveMember}
              />
              {group.members && group.members.length > 0 && invitations.length > 0 && (
                <View style={{ height: 8 }} />
              )}
              <InvitationsList
                invitations={invitations}
                loading={invitationsLoading}
                isOwner={memoizedIsOwner}
                cancellingInvitationId={cancellingInvitationId}
                onCancel={handleCancelInvitation}
              />
            </>
          )}
        </View>

        <BalancesSection
          groupBalances={balancesData?.group_balances || []}
          overallBalances={balancesData?.overall_balances || []}
          loading={balancesLoading}
          defaultCurrency={getDefaultCurrency()}
          showOverallBalances={false}
          onSettleUp={handleSettleUp}
          currentUserId={session?.user?.id}
          groupMembers={group.members || []}
        />

        <TransactionsSection
          items={transactions}
          loading={txLoading}
          onEdit={handleEditTransaction}
        />

        {/* Settlement History Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Pressable
              style={styles.sectionTitleRow}
              onPress={() => setSettlementsExpanded(!settlementsExpanded)}
            >
              <IconButton
                icon={settlementsExpanded ? "chevron-down" : "chevron-right"}
                size={20}
                iconColor={theme.colors.onSurface}
                onPress={() => setSettlementsExpanded(!settlementsExpanded)}
                style={styles.expandButton}
              />
              <Text variant="titleMedium" style={styles.sectionTitle}>
                Settlement History
                {settlementsData?.settlements && (
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    {" "}({settlementsData.settlements.length})
                  </Text>
                )}
              </Text>
            </Pressable>
          </View>

          {settlementsExpanded && (
            <>
              {settlementsLoading ? (
                <ActivityIndicator size="small" style={{ marginVertical: 16 }} />
              ) : settlementsData?.settlements && settlementsData.settlements.length > 0 ? (
                <>
                  {settlementsData.settlements.map((settlement, index) => {
                    const isCurrentUserPayer = settlement.from_user_id === session?.user?.id;
                    const isCurrentUserReceiver = settlement.to_user_id === session?.user?.id;
                    const otherUserEmail = isCurrentUserPayer
                      ? settlement.to_user_email
                      : settlement.from_user_email;
                    const otherUserDisplayName = otherUserEmail || `User ${(isCurrentUserPayer ? settlement.to_user_id : settlement.from_user_id).substring(0, 8)}...`;

                    return (
                      <React.Fragment key={settlement.id}>
                        <Card style={styles.settlementCard} mode="outlined">
                          <Card.Content>
                            <View style={styles.settlementContent}>
                              <View style={styles.settlementLeft}>
                                <Text variant="titleSmall" style={styles.settlementDescription}>
                                  {isCurrentUserPayer
                                    ? `You paid ${otherUserDisplayName}`
                                    : isCurrentUserReceiver
                                    ? `${otherUserDisplayName} paid you`
                                    : `${settlement.from_user_email || "User"} paid ${settlement.to_user_email || "User"}`}
                                </Text>
                                {settlement.notes && (
                                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
                                    {settlement.notes}
                                  </Text>
                                )}
                                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
                                  {new Date(settlement.created_at).toLocaleDateString()}
                                </Text>
                              </View>
                              <View style={styles.settlementRight}>
                                <Text
                                  variant="titleMedium"
                                  style={[
                                    styles.settlementAmount,
                                    { color: isCurrentUserPayer ? "#ef4444" : "#10b981" },
                                  ]}
                                >
                                  {formatCurrency(settlement.amount, settlement.currency || getDefaultCurrency())}
                                </Text>
                              </View>
                            </View>
                          </Card.Content>
                          {/* Only show edit/delete if current user created the settlement */}
                          {settlement.created_by === session?.user?.id && (
                            <Card.Actions>
                              <Button
                                mode="text"
                                onPress={() => handleEditSettlement(settlement)}
                                compact
                              >
                                Edit
                              </Button>
                              <Button
                                mode="text"
                                onPress={() => handleDeleteSettlement(settlement)}
                                textColor={theme.colors.error}
                                compact
                              >
                                Delete
                              </Button>
                            </Card.Actions>
                          )}
                        </Card>
                        {index < settlementsData.settlements.length - 1 && (
                          <View style={{ height: 8 }} />
                        )}
                      </React.Fragment>
                    );
                  })}
                </>
              ) : (
                <Card style={styles.emptyStateCard} mode="outlined">
                  <Card.Content style={styles.emptyStateContent}>
                    <Text
                      variant="bodyMedium"
                      style={[
                        styles.emptyStateMessage,
                        { color: theme.colors.onSurfaceVariant },
                      ]}
                    >
                      No settlements yet
                    </Text>
                  </Card.Content>
                </Card>
              )}
            </>
          )}
        </View>
      </ScrollView>

      {isMember && (
        <FAB
          icon="plus"
          label="Add"
          onPress={() => setShowTransactionForm(true)}
          style={styles.addTransactionButton}
        />
      )}

      <TransactionFormScreen
        visible={showTransactionForm}
        transaction={editingTransaction}
        onSave={async (transactionData) => {
          await handleTransactionFormSave(transactionData);
          setShowTransactionForm(false);
          setEditingTransaction(null);
        }}
        onDismiss={() => {
          setShowTransactionForm(false);
          setEditingTransaction(null);
        }}
        onDelete={
          editingTransaction
            ? async () => {
                try {
                  await handleDeleteTransaction(editingTransaction.id);
                  setShowTransactionForm(false);
                  setEditingTransaction(null);
                } catch (error) {
                  // Error is already handled in handleDeleteTransaction
                  throw error;
                }
              }
            : undefined
        }
        defaultCurrency={getDefaultCurrency()}
        // Note: Only actual group members are included in expense splitting.
        // Pending invitations are excluded because they haven't accepted yet
        // and don't have a user_id until they join the group.
        groupMembers={group.members || []}
        groupId={group.id}
      />

      <SettlementFormScreen
        visible={showSettlementForm}
        balance={settlingBalance}
        settlement={editingSettlement}
        groupMembers={group.members || []}
        currentUserId={session?.user?.id || ""}
        groupId={group.id}
        defaultCurrency={getDefaultCurrency()}
        onSave={handleSettlementSave}
        onUpdate={handleSettlementUpdate}
        onDismiss={() => {
          setShowSettlementForm(false);
          setSettlingBalance(null);
          setEditingSettlement(null);
        }}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  descriptionCard: {
    marginBottom: 16,
  },
  section: {
    marginTop: 8,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  sectionTitle: {
    fontWeight: "600",
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  expandButton: {
    margin: 0,
    marginLeft: -8,
  },
  memberCard: {
    marginBottom: 0,
  },
  memberCardRemoving: {
    opacity: 0.7,
  },
  memberContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  memberLeft: {
    flex: 1,
    marginRight: 8,
  },
  memberRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  memberName: {
    fontWeight: "600",
    marginBottom: 4,
  },
  roleChip: {
    height: 28,
  },
  removeMemberButton: {
    margin: 0,
  },
  removingIndicator: {
    marginHorizontal: 8,
  },
  transactionCard: {
    marginBottom: 0,
  },
  transactionContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  transactionLeft: {
    flex: 1,
    marginRight: 16,
  },
  transactionDescription: {
    fontWeight: "600",
    marginBottom: 4,
  },
  transactionMeta: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  transactionAmount: {
    fontWeight: "bold",
    marginBottom: 8,
  },
  transactionRight: {
    alignItems: "flex-end",
  },
  addTransactionButton: {
    position: "absolute",
    right: 16,
    bottom: 16, // Space for bottom navigation bar
  },
  emptyStateCard: {
    marginTop: 8,
  },
  emptyStateContent: {
    alignItems: "center",
    paddingVertical: 32,
    paddingHorizontal: 16,
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyStateTitle: {
    fontWeight: "600",
    marginBottom: 8,
    textAlign: "center",
  },
  emptyStateMessage: {
    textAlign: "center",
    lineHeight: 20,
  },
  settlementCard: {
    marginBottom: 0,
  },
  settlementContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  settlementLeft: {
    flex: 1,
    marginRight: 16,
  },
  settlementDescription: {
    fontWeight: "600",
  },
  settlementRight: {
    alignItems: "flex-end",
  },
  settlementAmount: {
    fontWeight: "bold",
  },
});
