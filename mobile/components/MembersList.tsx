import React from "react";
import { View } from "react-native";
import {
  ActivityIndicator,
  Card,
  Chip,
  IconButton,
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
