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
  isOwner: boolean;
  removingMemberId: string | null;
  onRemove: (userId: string, email?: string) => void;
}

export const MembersList: React.FC<MembersListProps> = ({
  members,
  currentUserId,
  isOwner,
  removingMemberId,
  onRemove,
}) => {
  const theme = useTheme();

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
    return name.substring(0, 2).toUpperCase();
  };

  return (
    <Surface elevation={0} style={{ backgroundColor: theme.colors.surface, borderRadius: 12 }}>
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
            <View
              style={[
                styles.memberContent,
                isRemoving && styles.memberCardRemoving,
                { paddingHorizontal: 16, paddingVertical: 12 }
              ]}
            >
              <Avatar.Text
                size={40}
                label={getInitials(memberName)}
                style={{
                  backgroundColor: member.role === 'owner' ? theme.colors.primaryContainer : theme.colors.secondaryContainer,
                  marginRight: 16
                }}
                color={member.role === 'owner' ? theme.colors.onPrimaryContainer : theme.colors.onSecondaryContainer}
              />
              <View style={styles.memberLeft}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text
                    variant="titleMedium"
                    style={[
                      styles.memberName,
                      isRemoving && { opacity: 0.6 },
                      { fontWeight: member.role === 'owner' ? 'bold' : 'normal' }
                    ]}
                  >
                    {memberName} {isCurrentUser ? "(You)" : ""}
                  </Text>
                  {member.role === 'owner' && (
                    <IconButton
                      icon="crown"
                      size={16}
                      iconColor={theme.colors.primary}
                      style={{ margin: 0, marginLeft: 4 }}
                    />
                  )}
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
            {index < members.length - 1 && <Divider />}
          </React.Fragment>
        );
      })}
    </Surface>
  );
};
