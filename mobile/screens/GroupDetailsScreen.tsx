import React, { useEffect, useState } from "react";
import { Alert, BackHandler, ScrollView, StyleSheet, View } from "react-native";
import {
  ActivityIndicator,
  Appbar,
  Button,
  FAB,
  Menu,
  SegmentedButtons,
  Text,
  useTheme,
} from "react-native-paper";
import { ActivityFeed } from "../components/ActivityFeed";
import { GroupDashboard } from "../components/GroupDashboard";
import { InvitationsList } from "../components/InvitationsList";
import { MembersList } from "../components/MembersList";
import { TransactionsSection } from "../components/TransactionsSection";
import { useAuth } from "../contexts/AuthContext";
import { useActivity } from "../hooks/useActivity";
import { useBalances } from "../hooks/useBalances";
import {
  useCancelInvitation,
  useGroupInvitations,
} from "../hooks/useGroupInvitations";
import {
  useAddMember,
  useDeleteGroup,
  useRemoveMember,
} from "../hooks/useGroupMutations";
import { useGroupDetails } from "../hooks/useGroups";
import {
  useCreateSettlement,
  useDeleteSettlement,
  useSettlements,
  useUpdateSettlement,
} from "../hooks/useSettlements";
import { useTransactions } from "../hooks/useTransactions";
import {
  Balance,
  GroupInvitation,
  GroupWithMembers,
  Settlement,
  Transaction,
} from "../types";
import { formatCurrency, getDefaultCurrency } from "../utils/currency";
import { showErrorAlert } from "../utils/errorHandling";
import {
  getUserFriendlyErrorMessage,
  isSessionExpiredError,
} from "../utils/errorMessages";
import { GroupStatsMode } from "./GroupStatsScreen";
import { SettlementFormScreen } from "./SettlementFormScreen";

interface GroupDetailsScreenProps {
  group: GroupWithMembers;
  onBack: () => void;
  onAddMember: () => void;
  onRemoveMember?: (userId: string) => Promise<void>;
  onLeaveGroup?: () => void;
  onDeleteGroup?: () => void;
  onAddTransaction: () => void;
  onEditTransaction: (transaction: Transaction) => void;
  refreshTrigger?: number; // When this changes, refresh invitations
  groupRefreshTrigger?: number; // When this changes, refresh group data
  onStatsPress?: (mode: GroupStatsMode) => void;
}

export const GroupDetailsScreen: React.FC<GroupDetailsScreenProps> = ({
  group: initialGroup,
  onBack,
  onAddMember,
  onRemoveMember,
  onLeaveGroup,
  onDeleteGroup,
  onAddTransaction,
  onEditTransaction,
  refreshTrigger,
  groupRefreshTrigger,
  onStatsPress,
}) => {
  const [leaving, setLeaving] = useState<boolean>(false);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [menuVisible, setMenuVisible] = useState<boolean>(false);
  const [showSettlementForm, setShowSettlementForm] = useState<boolean>(false);
  const [settlingBalance, setSettlingBalance] = useState<Balance | null>(null);
  const [editingSettlement, setEditingSettlement] = useState<Settlement | null>(
    null
  );
  const [showMembers, setShowMembers] = useState<boolean>(false);
  const [listMode, setListMode] = useState<"transactions" | "activity">(
    "transactions"
  );

  // Stable handler for closing menu
  const handleCloseMenu = () => {
    setMenuVisible(false);
  };

  // Stable handler for opening menu
  const handleOpenMenu = () => {
    setMenuVisible(true);
  };

  // Reset menu visibility when showMembers changes
  React.useEffect(() => {
    if (showMembers) {
      // Close menu when entering members view
      setMenuVisible(false);
    } else {
      // Reset menu state when coming back from members view
      // This ensures the menu can be opened again after returning
      setMenuVisible(false);
    }
  }, [showMembers]);

  // Fetch data with hooks
  const {
    data: groupData,
    isLoading: groupLoading,
    error: groupError,
    refetch: refetchGroup,
  } = useGroupDetails(initialGroup.id);
  const {
    data: txData,
    isLoading: txLoading,
    refetch: refetchTx,
  } = useTransactions(initialGroup.id);
  const {
    data: invitations = [] as GroupInvitation[],
    isLoading: invitationsLoading,
    refetch: refetchInvites,
  } = useGroupInvitations(initialGroup.id);
  const {
    data: balancesData,
    isLoading: balancesLoading,
    refetch: refetchBalances,
  } = useBalances(initialGroup.id);
  const {
    data: settlementsData,
    isLoading: settlementsLoading,
    refetch: refetchSettlements,
  } = useSettlements(initialGroup.id);
  const {
    data: activityData,
    isLoading: activityLoading,
    refetch: refetchActivity,
  } = useActivity(initialGroup.id);
  const [cancellingInvitationId, setCancellingInvitationId] = useState<
    string | null
  >(null);
  const { session, signOut } = useAuth();
  const theme = useTheme();

  // Auto sign-out on session expiration with alert
  useEffect(() => {
    if (groupError && isSessionExpiredError(groupError)) {
      showErrorAlert(groupError, signOut, "Session Expired");
    }
  }, [groupError, signOut]);

  // Handle Android hardware back button
  useEffect(() => {
    const handleHardwareBack = () => {
      if (showMembers) {
        setShowMembers(false);
        return true;
      }
      onBack();
      return true;
    };

    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      handleHardwareBack
    );
    return () => subscription.remove();
  }, [onBack, showMembers]);

  // Refetch all data function
  const refetchAll = () => {
    console.log("[GroupDetailsScreen] refetchAll called");
    refetchTx();
    refetchActivity();
    refetchBalances();
    refetchSettlements();
  };

  // Mutations

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
              Alert.alert("Error", getUserFriendlyErrorMessage(err));
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
              Alert.alert("Error", getUserFriendlyErrorMessage(error));
            } finally {
              setRemovingMemberId(null);
            }
          },
        },
      ]
    );
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
      `Are you sure you want to delete this settlement of ${formatCurrency(
        settlement.amount,
        settlement.currency || getDefaultCurrency()
      )}?`,
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
  const isMember =
    group.members?.some((m) => m.user_id === currentUserId) ?? false;

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
              Alert.alert("Error", getUserFriendlyErrorMessage(err));
            } finally {
              setCancellingInvitationId(null);
            }
          },
        },
      ]
    );
  };

  const handleStatNavigation = (mode: GroupStatsMode) => {
    if (onStatsPress) {
      onStatsPress(mode);
    }
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
    // Don't show Retry button for session expiration - user will be signed out automatically
    if (isSessionExpiredError(groupError)) {
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
            Session Expired
          </Text>
          <Text
            variant="bodyMedium"
            style={{ marginBottom: 24, textAlign: "center" }}
          >
            {getUserFriendlyErrorMessage(groupError)}
          </Text>
          <ActivityIndicator size="small" />
        </View>
      );
    }

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
        <Button
          mode="contained"
          onPress={() => {
            void refetchGroup();
          }}
        >
          Retry
        </Button>
      </View>
    );
  }

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <Appbar.Header style={{ backgroundColor: theme.colors.background }}>
        <Appbar.BackAction
          onPress={() => {
            if (showMembers) {
              setShowMembers(false);
            } else {
              onBack();
            }
          }}
          accessibilityLabel="Navigate back"
          testID="back-button"
        />
        <Appbar.Content
          title={showMembers ? "Group Members" : group.name}
          titleStyle={{ fontWeight: "bold" }}
        />

        {/* Always render Menu when member to prevent unmounting - control visibility via visible prop */}
        {isMember && (
          <Menu
            visible={menuVisible && !showMembers}
            onDismiss={handleCloseMenu}
            anchor={
              !showMembers ? (
                <Appbar.Action
                  icon="dots-vertical"
                  onPress={handleOpenMenu}
                  accessibilityLabel="Group options"
                  testID="group-menu-button"
                />
              ) : (
                <View style={{ width: 0, height: 0 }} />
              )
            }
            contentStyle={{ minWidth: 200 }}
          >
            <Menu.Item
              onPress={() => {
                handleCloseMenu();
                setShowMembers(true);
              }}
              title="View Members"
              leadingIcon="account-group"
            />
            {isOwner && (
              <Menu.Item
                onPress={() => {
                  handleCloseMenu();
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
                  handleCloseMenu();
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
                  handleCloseMenu();
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
        showsVerticalScrollIndicator={false}
      >
        {showMembers ? (
          // MEMBERS VIEW
          <View style={styles.sectionContent}>
            <MembersList
              members={group.members || []}
              currentUserId={session?.user?.id}
              isOwner={isOwner}
              removingMemberId={removingMemberId}
              onRemove={handleRemoveMember}
            />
            {group.members &&
              group.members.length > 0 &&
              invitations.length > 0 && <View style={{ height: 16 }} />}
            <InvitationsList
              invitations={invitations}
              loading={invitationsLoading}
              isOwner={memoizedIsOwner}
              cancellingInvitationId={cancellingInvitationId}
              onCancel={handleCancelInvitation}
            />
            {memoizedIsOwner && (
              <Button
                mode="contained"
                onPress={onAddMember}
                icon="account-plus"
                style={{ marginTop: 24 }}
              >
                Add Member
              </Button>
            )}
          </View>
        ) : (
          // DASHBOARD & LIST VIEW
          <>
            <GroupDashboard
              balances={balancesData?.overall_balances || []}
              transactions={transactions || []}
              currentUserId={session?.user?.id}
              loading={balancesLoading || txLoading}
              defaultCurrency={getDefaultCurrency()}
              onOwePress={() => handleStatNavigation("i-owe")}
              onOwedPress={() => handleStatNavigation("im-owed")}
              onMyCostsPress={() => handleStatNavigation("my-costs")}
              onTotalCostsPress={() => handleStatNavigation("total-costs")}
            />

            <View
              style={{ paddingHorizontal: 16, marginTop: 24, marginBottom: 8 }}
            >
              <SegmentedButtons
                value={listMode}
                onValueChange={(val: string) =>
                  setListMode(val as "transactions" | "activity")
                }
                buttons={[
                  {
                    value: "transactions",
                    label: "Transactions",
                    icon: "format-list-bulleted",
                  },
                  {
                    value: "activity",
                    label: "Activity",
                    icon: "history",
                  },
                ]}
              />
            </View>

            {listMode === "transactions" ? (
              <TransactionsSection
                items={transactions}
                loading={txLoading}
                onEdit={onEditTransaction}
              />
            ) : (
              <View style={styles.sectionContent}>
                <ActivityFeed
                  items={activityData?.activities || []}
                  loading={activityLoading}
                />
              </View>
            )}
          </>
        )}

        {/* Bottom padding for FAB */}
        <View style={{ height: 80 }} />
      </ScrollView>

      {!showMembers && (
        <FAB
          icon="plus"
          style={[
            styles.fab,
            { backgroundColor: theme.colors.primaryContainer },
          ]}
          color={theme.colors.onPrimaryContainer}
          onPress={onAddTransaction}
          label="Add Expense"
        />
      )}

      {/* Settlement form modal */}
      <SettlementFormScreen
        visible={showSettlementForm}
        balance={settlingBalance}
        settlement={editingSettlement}
        groupMembers={group.members || []}
        currentUserId={session?.user?.id || ""}
        groupId={group.id}
        defaultCurrency={getDefaultCurrency()}
        onSave={async (data) => {
          if (editingSettlement) {
            await handleSettlementUpdate({
              id: editingSettlement.id,
              ...data,
            });
          } else {
            await handleSettlementSave({
              ...data,
              group_id: group.id,
            });
          }
        }}
        onDismiss={() => {
          setShowSettlementForm(false);
          setSettlingBalance(null);
          setEditingSettlement(null);
        }}
      />
    </View>
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
  sectionSurface: {
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 4,
  },
  transactionsHeader: {
    marginTop: 8,
  },
  sectionContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    marginLeft: 8,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "bold",
  },
  spacer: {
    height: 16,
  },
  settlementItem: {
    paddingVertical: 8,
    backgroundColor: "transparent",
  },
  settlementContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  settlementLeft: {
    flex: 1,
    marginRight: 16,
  },
  settlementRight: {
    alignItems: "flex-end",
  },
  settlementDescription: {
    fontWeight: "500",
  },
  settlementAmount: {
    fontWeight: "bold",
  },
  settlementActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 8,
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(0,0,0,0.05)",
    marginVertical: 8,
  },
  fab: {
    position: "absolute",
    margin: 16,
    right: 0,
    bottom: 10,
    borderRadius: 16,
  },
  transactionLeft: {
    flex: 1,
    marginRight: 16,
  },
  transactionRight: {
    alignItems: "flex-end",
  },
  description: {
    fontWeight: "500",
  },
  amount: {
    fontWeight: "bold",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  chipAndActions: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  typeChip: {
    height: 24,
    marginRight: 0,
  },
  actionButtons: {
    flexDirection: "row",
    marginLeft: 4,
  },
  addTransactionButton: {
    position: "absolute",
    margin: 16,
    right: 0,
    bottom: 0,
  },
  emptyStateCard: {
    marginBottom: 0,
    borderStyle: "dashed",
    backgroundColor: "transparent",
  },
  emptyStateContent: {
    alignItems: "center",
    paddingVertical: 24,
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
