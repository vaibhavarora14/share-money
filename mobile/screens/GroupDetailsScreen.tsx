import React, { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import {
  ActivityIndicator,
  Appbar,
  Button,
  Card,
  Chip,
  FAB,
  IconButton,
  Menu,
  Text,
  useTheme,
} from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../contexts/AuthContext";
import { GroupInvitation, GroupMember, GroupWithMembers, Transaction } from "../types";
import { formatCurrency, getDefaultCurrency } from "../utils/currency";
import { getUserFriendlyErrorMessage } from "../utils/errorMessages";
import { TransactionFormScreen } from "./TransactionFormScreen";
import { useDeleteGroup, useRemoveMember } from "../hooks/useGroupMutations";
import { useCancelInvitation } from "../hooks/useInvitationMutations";
import { useGroupDetails } from "../hooks/useGroupDetails";
import { useTransactions } from "../hooks/useTransactions";
import { useGroupInvitations } from "../hooks/useGroupInvitations";
import {
  useCreateTransaction,
  useUpdateTransaction,
  useDeleteTransaction,
} from "../hooks/useTransactionMutations";

// API URL - must be set via EXPO_PUBLIC_API_URL environment variable
const API_URL = process.env.EXPO_PUBLIC_API_URL;

interface GroupDetailsScreenProps {
  group: GroupWithMembers;
  onBack: () => void;
  onAddMember: () => void;
  onRemoveMember?: (userId: string) => Promise<void>;
  onLeaveGroup?: () => void;
  onDeleteGroup?: () => void;
  onTransactionAdded?: () => void;
  refreshTrigger?: number; // When this changes, refresh invitations
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
}) => {
  const [leaving, setLeaving] = useState<boolean>(false);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [menuVisible, setMenuVisible] = useState<boolean>(false);
  const [showTransactionForm, setShowTransactionForm] =
    useState<boolean>(false);
  const [editingTransaction, setEditingTransaction] =
    useState<Transaction | null>(null);
  // React Query data - use directly, no local state needed
  const { data: groupData, isLoading: groupLoading, error: groupError, refetch: refetchGroup } = useGroupDetails(initialGroup.id);
  const { data: txData = [] as Transaction[], isLoading: txLoading, refetch: refetchTx } = useTransactions(initialGroup.id);
  const { data: invitations = [] as GroupInvitation[], isLoading: invitationsLoading, refetch: refetchInvites } = useGroupInvitations(initialGroup.id);
  const [cancellingInvitationId, setCancellingInvitationId] = useState<
    string | null
  >(null);
  const [membersExpanded, setMembersExpanded] = useState<boolean>(false);
  const { session, signOut } = useAuth();
  const theme = useTheme();
  // Mutations
  const createTx = useCreateTransaction();
  const updateTx = useUpdateTransaction();
  const deleteTx = useDeleteTransaction();
  const deleteGroupMutation = useDeleteGroup();
  const removeMemberMutation = useRemoveMember();
  const cancelInvite = useCancelInvitation();

  // Use groupData directly, fallback to initialGroup while loading
  const group = groupData || initialGroup;
  
  // API already filters by group_id, so no need for client-side filtering
  const transactions = txData;

  // Local presentational components (extracted for clarity)
  const MembersList: React.FC<{
    members: GroupMember[];
    currentUserId?: string;
    isOwner: boolean;
    removingMemberId: string | null;
    onRemove: (userId: string, email?: string) => void;
  }> = ({ members, currentUserId, isOwner, removingMemberId, onRemove }) => {
    if (members.length === 0) {
      return (
        <Text
          variant="bodyMedium"
          style={{
            color: theme.colors.onSurfaceVariant,
            textAlign: "center",
          }}
        >
          No members yet
        </Text>
      );
    }

    return (
      <>
        {members.map((member, index) => {
          const memberName =
            member.email || `User ${member.user_id.substring(0, 8)}...`;
          const isCurrentUser = member.user_id === currentUserId;
          const ownerCount =
            members.filter((m) => m.role === "owner").length || 0;
          const canRemove =
            (isOwner &&
              (!isCurrentUser ||
                (isCurrentUser && (ownerCount > 1 || member.role !== "owner")))) ||
            (!isOwner && isCurrentUser);
          const isRemoving = removingMemberId === member.user_id;

          return (
            <React.Fragment key={member.id}>
              <Card
                style={[
                  styles.memberCard,
                  isRemoving && styles.memberCardRemoving,
                ]}
                mode="outlined"
              >
                <Card.Content style={styles.memberContent}>
                  <View style={styles.memberLeft}>
                    <Text
                      variant="titleSmall"
                      style={[
                        styles.memberName,
                        isRemoving && { opacity: 0.6 },
                      ]}
                    >
                      {memberName}
                    </Text>
                    <Text
                      variant="bodySmall"
                      style={{
                        color: theme.colors.onSurfaceVariant,
                        opacity: isRemoving ? 0.6 : 1,
                      }}
                    >
                      Joined {formatDate(member.joined_at)}
                    </Text>
                  </View>
                  <View style={styles.memberRight}>
                    {isRemoving ? (
                      <ActivityIndicator
                        size="small"
                        color={theme.colors.primary}
                        style={styles.removingIndicator}
                      />
                    ) : (
                      <>
                        <Chip
                          style={[
                            styles.roleChip,
                            {
                              backgroundColor:
                                member.role === "owner"
                                  ? theme.colors.primaryContainer
                                  : theme.colors.surfaceVariant,
                            },
                          ]}
                          textStyle={{
                            color:
                              member.role === "owner"
                                ? theme.colors.onPrimaryContainer
                                : theme.colors.onSurfaceVariant,
                          }}
                        >
                          {member.role}
                        </Chip>
                        {canRemove && (
                          <IconButton
                            icon="delete-outline"
                            size={20}
                            iconColor={theme.colors.error}
                            onPress={() => onRemove(member.user_id, member.email)}
                            style={styles.removeMemberButton}
                            disabled={removingMemberId !== null}
                          />
                        )}
                      </>
                    )}
                  </View>
                </Card.Content>
              </Card>
              {index < members.length - 1 && <View style={{ height: 8 }} />}
            </React.Fragment>
          );
        })}
      </>
    );
  };

  const InvitationsList: React.FC<{
    invitations: GroupInvitation[];
    loading: boolean;
    isOwner: boolean;
    cancellingInvitationId: string | null;
    onCancel: (invitationId: string) => void;
  }> = ({ invitations, loading, isOwner, cancellingInvitationId, onCancel }) => {
    if (invitations.length === 0) {
      return null;
    }

    if (loading) {
      return (
        <ActivityIndicator size="small" style={{ marginVertical: 16 }} />
      );
    }

    return (
      <>
        {invitations.map((invitation, index) => {
          const isCancelling = cancellingInvitationId === invitation.id;
          const expiresDate = new Date(invitation.expires_at);
          const isExpired = expiresDate < new Date();

          return (
            <React.Fragment key={invitation.id}>
              <Card
                style={[
                  styles.memberCard,
                  isCancelling && styles.memberCardRemoving,
                  isExpired && { opacity: 0.6 },
                ]}
                mode="outlined"
              >
                <Card.Content style={styles.memberContent}>
                  <View style={styles.memberLeft}>
                    <Text
                      variant="titleSmall"
                      style={[
                        styles.memberName,
                        isCancelling && { opacity: 0.6 },
                      ]}
                    >
                      {invitation.email}
                    </Text>
                    <Text
                      variant="bodySmall"
                      style={{
                        color: theme.colors.onSurfaceVariant,
                        opacity: isCancelling ? 0.6 : 1,
                      }}
                    >
                      Invited {formatDate(invitation.created_at)}
                      {isExpired
                        ? " • Expired"
                        : ` • Expires ${formatDate(invitation.expires_at)}`}
                    </Text>
                  </View>
                  <View style={styles.memberRight}>
                    {isOwner && (
                      <>
                        {isCancelling ? (
                          <ActivityIndicator
                            size="small"
                            color={theme.colors.primary}
                            style={styles.removingIndicator}
                          />
                        ) : (
                          <IconButton
                            icon="close-circle-outline"
                            size={20}
                            iconColor={theme.colors.error}
                            onPress={() => onCancel(invitation.id)}
                            style={styles.removeMemberButton}
                            disabled={cancellingInvitationId !== null}
                          />
                        )}
                      </>
                    )}
                  </View>
                </Card.Content>
              </Card>
              {index < invitations.length - 1 && (
                <View style={{ height: 8 }} />
              )}
            </React.Fragment>
          );
        })}
      </>
    );
  };

  const TransactionsSection: React.FC<{
    items: Transaction[];
    loading: boolean;
    onEdit: (t: Transaction) => void;
  }> = ({ items, loading, onEdit }) => (
    <View style={[styles.section, { marginTop: 24 }]}>
      <Text variant="titleMedium" style={styles.sectionTitle}>
        Transactions ({items.length})
      </Text>
      {loading ? (
        <ActivityIndicator size="small" style={{ marginVertical: 16 }} />
      ) : items.length > 0 ? (
        items.slice(0, 5).map((transaction, index) => {
          const isIncome = transaction.type === "income";
          const amountColor = isIncome ? "#10b981" : "#ef4444";
          const sign = isIncome ? "+" : "-";
          return (
            <React.Fragment key={transaction.id}>
              <Card
                style={styles.transactionCard}
                mode="outlined"
                onPress={() => onEdit(transaction)}
              >
                <Card.Content style={styles.transactionContent}>
                  <View style={styles.transactionLeft}>
                    <Text
                      variant="titleSmall"
                      style={styles.transactionDescription}
                    >
                      {transaction.description || "No description"}
                    </Text>
                    <View style={styles.transactionMeta}>
                      <Text
                        variant="bodySmall"
                        style={{ color: theme.colors.onSurfaceVariant }}
                      >
                        {formatDate(transaction.date)}
                        {transaction.category && ` • ${transaction.category}`}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.transactionRight}>
                    <Text
                      variant="titleMedium"
                      style={[styles.transactionAmount, { color: amountColor }]}
                    >
                      {sign}
                      {formatCurrency(
                        transaction.amount,
                        transaction.currency
                      )}
                    </Text>
                  </View>
                </Card.Content>
              </Card>
              {index < Math.min(items.length, 5) - 1 && (
                <View style={{ height: 8 }} />
              )}
            </React.Fragment>
          );
        })
      ) : (
        <Card style={styles.emptyStateCard} mode="outlined">
          <Card.Content style={styles.emptyStateContent}>
            <Text
              variant="headlineSmall"
              style={[
                styles.emptyStateIcon,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              💰
            </Text>
            <Text
              variant="titleMedium"
              style={[
                styles.emptyStateTitle,
                { color: theme.colors.onSurface },
              ]}
            >
              No Transactions Yet
            </Text>
            <Text
              variant="bodyMedium"
              style={[
                styles.emptyStateMessage,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              Start tracking expenses and income for this group by adding your
              first transaction.
            </Text>
          </Card.Content>
        </Card>
      )}
      {items.length > 5 && (
        <Text
          variant="bodySmall"
          style={{
            color: theme.colors.primary,
            textAlign: "center",
            marginTop: 8,
          }}
        >
          Showing 5 of {items.length} transactions
        </Text>
      )}
    </View>
  );

  // Refresh invitations when refreshTrigger changes (e.g., after adding a member)
  useEffect(() => {
    if (refreshTrigger !== undefined && refreshTrigger > 0) {
      refetchInvites();
    }
  }, [refreshTrigger, refetchInvites]);

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
              await deleteGroupMutation.mutateAsync(group.id);
              if (onDeleteGroup) {
                onDeleteGroup();
              } else {
                onBack();
              }
            } catch (err) {
              Alert.alert(
                "Error",
                err instanceof Error ? err.message : "Failed to delete group"
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
              await removeMemberMutation.mutateAsync({
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

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const handleCreateTransaction = async (
    transactionData: Omit<Transaction, "id" | "created_at" | "user_id">
  ): Promise<void> => {
    await createTx.mutateAsync({
      ...transactionData,
      group_id: group.id,
      currency: transactionData.currency || getDefaultCurrency(),
    });
  };

  const handleUpdateTransaction = async (
    transactionData: Omit<Transaction, "id" | "created_at" | "user_id">
  ): Promise<void> => {
    if (!editingTransaction) throw new Error("Invalid request");
    await updateTx.mutateAsync({
      ...transactionData,
      id: editingTransaction.id,
      currency: transactionData.currency || getDefaultCurrency(),
    });
  };

  const handleDeleteTransaction = async (transactionId: number): Promise<void> => {
    await deleteTx.mutateAsync({ id: transactionId, group_id: group.id });
  };

  const handleRemoveMember = async (
    memberUserId: string,
    memberEmail?: string
  ) => {
    if (!onRemoveMember) {
      return;
    }

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
              await onRemoveMember(memberUserId);
              // If removing self, navigate back
              if (isRemovingSelf && onLeaveGroup) {
                onLeaveGroup();
              }
            } catch (error) {
              Alert.alert(
                "Error",
                error instanceof Error
                  ? error.message
                  : "Failed to remove member"
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

  const currentUserId = session?.user?.id;
  const isOwner =
    group.created_by === currentUserId ||
    group.members?.some(
      (m) => m.user_id === currentUserId && m.role === "owner"
    );
  const isMember = group.members?.some((m) => m.user_id === currentUserId);

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
              await cancelInvite.mutateAsync({
                invitationId,
                groupId: group.id,
              });
            } catch (err) {
              Alert.alert(
                "Error",
                err instanceof Error
                  ? err.message
                  : "Failed to cancel invitation"
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
          {groupError instanceof Error ? groupError.message : String(groupError)}
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

        <TransactionsSection
          items={transactions}
          loading={txLoading}
          onEdit={handleEditTransaction}
        />
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
});
