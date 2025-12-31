import React, { useEffect, useMemo, useState } from "react";
import { Alert, BackHandler, Platform, ScrollView, StyleSheet, View } from "react-native";
import {
  ActivityIndicator,
  Appbar,
  Avatar,
  Button,
  Chip,
  Dialog,
  FAB,
  Menu,
  Portal,
  SegmentedButtons,
  Text,
  useTheme
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
import { useAddMember, useRemoveMember } from "../hooks/useGroupMutations";
import { useGroupDetails } from "../hooks/useGroups";
import { useParticipants } from "../hooks/useParticipants";
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
import { getDefaultCurrency } from "../utils/currency";
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
  const [showActivityFilters, setShowActivityFilters] = useState(false);
  const [activityFilterType, setActivityFilterType] = useState<"all" | "expenses" | "settlements">("all");
  const [activityFilterParticipantId, setActivityFilterParticipantId] = useState<string>("all");
  
  // Web-compatible confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    visible: boolean;
    title: string;
    message: string;
    confirmText: string;
    onConfirm: () => void;
    destructive?: boolean;
  } | null>(null);

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
    data: participants = [],
  } = useParticipants(initialGroup.id);
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


  // Map user_id to participant_id for involvement filtering
  const userIdToParticipantId = useMemo(() => {
    const map = new Map<string, string>();
    participants.forEach(p => {
      if (p.user_id) map.set(p.user_id, p.id);
    });
    return map;
  }, [participants]);

  // Filter activity items
  const filteredActivities = useMemo(() => {
    let items = activityData?.activities || [];
    
    // Filter by type
    if (activityFilterType !== "all") {
      items = items.filter(item => {
        if (activityFilterType === "expenses") return item.type.startsWith("transaction");
        if (activityFilterType === "settlements") return item.type.startsWith("settlement");
        return true;
      });
    }
    
    // Filter by participant involvement
    if (activityFilterParticipantId !== "all") {
      items = items.filter(item => {
        // 1. Check if they are the actor (the one who made the change)
        const actorParticipantId = userIdToParticipantId.get(item.changed_by.id);
        if (actorParticipantId === activityFilterParticipantId) return true;

        // 2. Check transaction details
        if (item.details?.transaction) {
          const t = item.details.transaction;
          if (t.paid_by_participant_id === activityFilterParticipantId) return true;
          if (t.split_among_participant_ids?.includes(activityFilterParticipantId)) return true;
          if (t.splits?.some(s => s.participant_id === activityFilterParticipantId)) return true;
        }

        // 3. Check settlement details
        if (item.details?.settlement) {
          const s = item.details.settlement;
          if (s.from_participant_id === activityFilterParticipantId) return true;
          if (s.to_participant_id === activityFilterParticipantId) return true;
        }

        return false;
      });
    }
    
    return items;
  }, [activityData?.activities, activityFilterType, activityFilterParticipantId, userIdToParticipantId]);

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

  const handleLeaveGroup = async () => {
    const currentUserId = session?.user?.id;
    if (!currentUserId) {
      if (Platform.OS === "web") {
        setConfirmDialog({
          visible: true,
          title: "Error",
          message: "Unable to identify user",
          confirmText: "OK",
          onConfirm: () => setConfirmDialog(null),
        });
      } else {
        Alert.alert("Error", "Unable to identify user");
      }
      return;
    }

    const performLeave = async () => {
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
        if (Platform.OS === "web") {
          setConfirmDialog({
            visible: true,
            title: "Error",
            message: getUserFriendlyErrorMessage(err),
            confirmText: "OK",
            onConfirm: () => setConfirmDialog(null),
          });
        } else {
          Alert.alert("Error", getUserFriendlyErrorMessage(err));
        }
      } finally {
        setLeaving(false);
        setMenuVisible(false);
      }
    };

    if (Platform.OS === "web") {
      setConfirmDialog({
        visible: true,
        title: "Leave Group",
        message: `Are you sure you want to leave "${group.name}"?`,
        confirmText: "Leave",
        destructive: true,
        onConfirm: () => {
          setConfirmDialog(null);
          void performLeave();
        },
      });
    } else {
      Alert.alert(
        "Leave Group",
        `Are you sure you want to leave "${group.name}"?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Leave",
            style: "destructive",
            onPress: performLeave,
          },
        ]
      );
    }
  };

  const handleRemoveMember = async (
    memberUserId: string,
    memberEmail?: string
  ) => {
    const memberName = memberEmail || `User ${memberUserId.substring(0, 8)}...`;
    const isRemovingSelf = memberUserId === session?.user?.id;

    const performRemove = async () => {
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
        if (Platform.OS === "web") {
          setConfirmDialog({
            visible: true,
            title: "Error",
            message: getUserFriendlyErrorMessage(error),
            confirmText: "OK",
            onConfirm: () => setConfirmDialog(null),
          });
        } else {
          Alert.alert("Error", getUserFriendlyErrorMessage(error));
        }
      } finally {
        setRemovingMemberId(null);
      }
    };

    if (Platform.OS === "web") {
      setConfirmDialog({
        visible: true,
        title: isRemovingSelf ? "Leave Group" : "Remove Member",
        message: isRemovingSelf
          ? `Are you sure you want to leave "${group.name}"?`
          : `Are you sure you want to remove "${memberName}" from this group?`,
        confirmText: isRemovingSelf ? "Leave" : "Remove",
        destructive: true,
        onConfirm: () => {
          setConfirmDialog(null);
          void performRemove();
        },
      });
    } else {
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
            onPress: performRemove,
          },
        ]
      );
    }
  };

  const handleSettleUp = (balance: Balance) => {
    setSettlingBalance(balance);
    setShowSettlementForm(true);
  };

  const handleSettlementSave = async (settlementData: {
    group_id: string;
    from_participant_id: string;
    to_participant_id: string;
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
    from_participant_id?: string;
    to_participant_id?: string;
  }) => {
    await updateSettlement.mutate(updateData);
    setShowSettlementForm(false);
    setEditingSettlement(null);
  };

  const handleEditSettlement = (settlement: Settlement) => {
    // Ensure settlement has group_id (may be missing from activity snapshot)
    const settlementWithGroupId = {
      ...settlement,
      group_id: settlement.group_id || group.id,
    };
    setEditingSettlement(settlementWithGroupId);
    setShowSettlementForm(true);
  };

  const currentUserId = session?.user?.id;
  // isMember checks if the user exists in the group list at all (includes active and left)
  const isMember =
    group.members?.some((m) => m.user_id === currentUserId) ?? false;
  
  // isActiveMember checks if the user is currently active
  const isActiveMember =
    group.members?.some((m) => m.user_id === currentUserId && m.status === 'active') ?? false;

  const canManageMembers = isActiveMember;
  const canManageInvites = isActiveMember;

  const handleCancelInvitation = async (invitationId: string) => {
    const performCancel = async () => {
      try {
        setCancellingInvitationId(invitationId);
        await cancelInvite.mutate({
          invitationId,
          groupId: group.id,
        });
      } catch (err) {
        if (Platform.OS === "web") {
          setConfirmDialog({
            visible: true,
            title: "Error",
            message: getUserFriendlyErrorMessage(err),
            confirmText: "OK",
            onConfirm: () => setConfirmDialog(null),
          });
        } else {
          Alert.alert("Error", getUserFriendlyErrorMessage(err));
        }
      } finally {
        setCancellingInvitationId(null);
      }
    };

    if (Platform.OS === "web") {
      setConfirmDialog({
        visible: true,
        title: "Cancel Invitation",
        message: "Are you sure you want to cancel this invitation?",
        confirmText: "Yes",
        destructive: true,
        onConfirm: () => {
          setConfirmDialog(null);
          void performCancel();
        },
      });
    } else {
      Alert.alert(
        "Cancel Invitation",
        "Are you sure you want to cancel this invitation?",
        [
          { text: "No", style: "cancel" },
          {
            text: "Yes",
            style: "destructive",
            onPress: performCancel,
          },
        ]
      );
    }
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
        


        {/* Group options (active members only) */}
        {isActiveMember && (
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
          </Menu>
        )}
      </Appbar.Header>

      {/* Banner for former members */}
      {!isActiveMember && isMember && !showMembers && (
          <View style={{ backgroundColor: theme.colors.errorContainer, paddingHorizontal: 16, paddingVertical: 8, alignItems: 'center', width: '100%' }}>
            <Text style={{ color: theme.colors.onErrorContainer, fontSize: 12, fontWeight: 'bold' }}>
              You are viewing this group as a former member
            </Text>
          </View>
      )}

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
              canManageMembers={canManageMembers}
              removingMemberId={removingMemberId}
              onRemove={handleRemoveMember}
            />
            {group.members &&
              group.members.length > 0 &&
              invitations.length > 0 && <View style={{ height: 16 }} />}
            <InvitationsList
              invitations={invitations.filter((i) => i.status === 'pending')}
              loading={invitationsLoading}
              canManageInvites={canManageInvites}
              cancellingInvitationId={cancellingInvitationId}
              onCancel={handleCancelInvitation}
            />
            {canManageMembers && (
              <Button
                mode="contained"
                onPress={onAddMember}
                icon="account-plus"
                style={{ marginTop: 24 }}
                testID="add-member-button"
              >
                Add Member
              </Button>
            )}
          </View>
        ) : (
          // DASHBOARD & LIST VIEW
          <>
            <GroupDashboard
              balances={balancesData?.group_balances?.[0]?.balances || []}
              transactions={transactions || []}
              currentUserId={session?.user?.id}
              currentUserParticipantId={group.members?.find(m => m.user_id === session?.user?.id)?.participant_id}
              loading={balancesLoading}
              defaultCurrency={getDefaultCurrency()}
              onSettlePress={(balance) => {
                  setSettlingBalance(balance);
                  setShowSettlementForm(true);
              }}
              onMyCostsPress={() => handleStatNavigation("my-costs")}
              onTotalCostsPress={() => handleStatNavigation("total-costs")}
            />

            <View
              style={{ paddingHorizontal: 16, marginTop: 16, marginBottom: 0 }}
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
                onEdit={isActiveMember ? onEditTransaction : () => {}}
                members={group.members || []}
                participants={participants}
              />
            ) : (
              <View style={[styles.sectionContent, styles.activitySection]}>

                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 0, paddingHorizontal: 4, marginTop: -8 }}>
                   <Button 
                     mode={showActivityFilters ? "contained-tonal" : "text"}
                     onPress={() => setShowActivityFilters(!showActivityFilters)} 
                     icon={showActivityFilters ? "filter-variant-remove" : "filter-variant"}
                     compact
                     style={{ borderRadius: 20 }}
                     contentStyle={{ flexDirection: 'row-reverse' }}
                   >
                     Filters {(activityFilterType !== "all" || activityFilterParticipantId !== "all") && "•"}
                   </Button>
                </View>

                {showActivityFilters && (
                  <View style={styles.filterContainer}>
                    <Text variant="labelLarge" style={styles.filterLabel}>Filter by Type</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
                      <Chip 
                        selected={activityFilterType === "all"} 
                        onPress={() => setActivityFilterType("all")}
                        style={[styles.filterChip, activityFilterType === "all" && { backgroundColor: theme.colors.primaryContainer }]}
                        showSelectedCheck={true}
                        mode={activityFilterType === "all" ? "flat" : "outlined"}
                      >
                        All Types
                      </Chip>
                      <Chip 
                        selected={activityFilterType === "expenses"} 
                        onPress={() => setActivityFilterType("expenses")}
                        style={[styles.filterChip, activityFilterType === "expenses" && { backgroundColor: theme.colors.primaryContainer }]}
                        showSelectedCheck={true}
                        icon="format-list-bulleted"
                        mode={activityFilterType === "expenses" ? "flat" : "outlined"}
                      >
                        Expenses
                      </Chip>
                      <Chip 
                        selected={activityFilterType === "settlements"} 
                        onPress={() => setActivityFilterType("settlements")}
                        style={[styles.filterChip, activityFilterType === "settlements" && { backgroundColor: theme.colors.primaryContainer }]}
                        showSelectedCheck={true}
                        icon="hand-coin"
                        mode={activityFilterType === "settlements" ? "flat" : "outlined"}
                      >
                        Settlements
                      </Chip>
                    </ScrollView>

                    <Text variant="labelLarge" style={[styles.filterLabel, { marginTop: 4 }]}>Filter by Person</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
                      <Chip 
                        selected={activityFilterParticipantId === "all"} 
                        onPress={() => setActivityFilterParticipantId("all")}
                        style={[styles.filterChip, activityFilterParticipantId === "all" && { backgroundColor: theme.colors.primaryContainer }]}
                        showSelectedCheck={true}
                        mode={activityFilterParticipantId === "all" ? "flat" : "outlined"}
                      >
                        Everyone
                      </Chip>
                      {participants.map(participant => (
                        <Chip
                          key={participant.id}
                          selected={activityFilterParticipantId === participant.id}
                          onPress={() => setActivityFilterParticipantId(participant.id)}
                          style={[styles.filterChip, activityFilterParticipantId === participant.id && { backgroundColor: theme.colors.primaryContainer }]}
                          showSelectedCheck={true}
                          avatar={participant.avatar_url ? <Avatar.Image size={24} source={{ uri: participant.avatar_url }} /> : undefined}
                          mode={activityFilterParticipantId === participant.id ? "flat" : "outlined"}
                        >
                          {participant.full_name || participant.email?.split('@')[0] || "User"}
                        </Chip>
                      ))}
                    </ScrollView>
                  </View>
                )}

                <ActivityFeed
                  items={filteredActivities}
                  loading={activityLoading}
                  isFiltered={activityFilterType !== "all" || activityFilterParticipantId !== "all"}
                />
              </View>
            )}
          </>
        )}

        {/* Bottom padding for FAB */}
        <View style={{ height: 80 }} />
      </ScrollView>

      {!showMembers && isActiveMember && (
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
            await handleSettlementSave(data);
          }
        }}
        onDismiss={() => {
          setShowSettlementForm(false);
          setSettlingBalance(null);
          setEditingSettlement(null);
        }}
      />

      {/* Web-compatible confirmation dialog */}
      {Platform.OS === "web" && confirmDialog && (
        <Portal>
          <Dialog
            visible={confirmDialog.visible}
            onDismiss={() => setConfirmDialog(null)}
          >
            <Dialog.Title>{confirmDialog.title}</Dialog.Title>
            <Dialog.Content>
              <Text variant="bodyMedium">{confirmDialog.message}</Text>
            </Dialog.Content>
            <Dialog.Actions>
              <Button onPress={() => setConfirmDialog(null)}>Cancel</Button>
              <Button
                onPress={confirmDialog.onConfirm}
                mode={confirmDialog.destructive ? "contained" : "text"}
                buttonColor={confirmDialog.destructive ? theme.colors.error : undefined}
                textColor={confirmDialog.destructive ? theme.colors.onError : undefined}
              >
                {confirmDialog.confirmText}
              </Button>
            </Dialog.Actions>
          </Dialog>
        </Portal>
      )}
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
    paddingHorizontal: 0,
    paddingBottom: 16,
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
  activitySection: {
    paddingBottom: 16,
    paddingTop: 12, 
  },
  filterContainer: {
    marginBottom: 12, 
    paddingTop: 0,
  },
  filterLabel: {
    marginBottom: 2,
    opacity: 0.7,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  filterRow: {
    marginBottom: 0,
  },
  filterChip: {
    marginRight: 8,
    height: 32,
  },
});
