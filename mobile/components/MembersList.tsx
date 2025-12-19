import React from "react";
import { View } from "react-native";
import {
  ActivityIndicator,
  Avatar,
  Divider,
  IconButton,
  Surface,
  Text,
  useTheme,
} from "react-native-paper";
import { GroupMember } from "../types";
import { formatDate } from "../utils/date";
import { styles } from "./MembersList.styles";

interface MembersListProps {
  members: GroupMember[];
  currentUserId?: string;
  /**
   * If true, the current user can remove any member (including themselves).
   */
  canManageMembers: boolean;
  removingMemberId: string | null;
  onRemove: (userId: string, email?: string) => void;
}

export const MembersList: React.FC<MembersListProps> = ({
  members,
  currentUserId,
  canManageMembers,
  removingMemberId,
  onRemove,
}) => {
  const theme = useTheme();
  const sortedMembers = React.useMemo(() => {
    // Show only active members in the list view
    return members.filter((m) => m.status !== "left");
  }, [members]);

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

  const getInitials = (name: string) => {
    if (name.includes(" ")) {
      const names = name.trim().split(" ");
      if (names.length >= 2) {
        return `${names[0][0]}${names[names.length - 1][0]}`.toUpperCase();
      }
    }
    return name.substring(0, 2).toUpperCase();
  };

  return (
    <Surface
      elevation={0}
      style={{ backgroundColor: theme.colors.surface, borderRadius: 12 }}
    >
      {sortedMembers.map((member, index) => {
        // Priority: full_name → email → fallback to truncated user_id
        const memberName =
          member.full_name ||
          member.email ||
          `User ${member.user_id.substring(0, 8)}...`;
        const isCurrentUser = member.user_id === currentUserId;
        const isActive = member.status !== "left";
        const canRemove =
          isActive &&
          (canManageMembers ||
            (isCurrentUser && canManageMembers) ||
            isCurrentUser);
        const isRemoving = removingMemberId === member.user_id;

        return (
          <React.Fragment key={member.id}>
            <View
              style={[
                styles.memberContent,
                isRemoving && styles.memberCardRemoving,
                { paddingHorizontal: 16, paddingVertical: 12 },
              ]}
            >
              <Avatar.Text
                size={40}
                label={getInitials(memberName)}
                style={{
                  backgroundColor: isActive
                    ? theme.colors.secondaryContainer
                    : theme.colors.surfaceVariant,
                  marginRight: 16,
                }}
                color={
                  isActive
                    ? theme.colors.onSecondaryContainer
                    : theme.colors.onSurfaceVariant
                }
              />
              <View style={styles.memberLeft}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text
                    variant="titleMedium"
                    style={[
                      styles.memberName,
                      isRemoving && { opacity: 0.6 },
                      {},
                    ]}
                  >
                    {memberName} {isCurrentUser ? "(You)" : ""}
                    {!isActive ? " (Left)" : ""}
                  </Text>
                </View>
                <Text
                  variant="bodyMedium"
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
                    {canRemove && (
                      <IconButton
                        icon="delete-outline"
                        size={24}
                        iconColor={theme.colors.error}
                        onPress={() => onRemove(member.user_id, member.email)}
                        style={styles.removeMemberButton}
                        disabled={removingMemberId !== null}
                      />
                    )}
                  </>
                )}
              </View>
            </View>
            {index < sortedMembers.length - 1 && <Divider />}
          </React.Fragment>
        );
      })}
    </Surface>
  );
};
