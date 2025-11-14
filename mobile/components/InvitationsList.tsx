import React from "react";
import { View } from "react-native";
import {
  ActivityIndicator,
  Card,
  IconButton,
  Text,
  useTheme,
} from "react-native-paper";
import { GroupInvitation } from "../types";
import { formatDate } from "../utils/date";
import { styles } from "./InvitationsList.styles";

interface InvitationsListProps {
  invitations: GroupInvitation[];
  loading: boolean;
  isOwner: boolean;
  cancellingInvitationId: string | null;
  onCancel: (invitationId: string) => void;
}

export const InvitationsList: React.FC<InvitationsListProps> = ({
  invitations,
  loading,
  isOwner,
  cancellingInvitationId,
  onCancel,
}) => {
  const theme = useTheme();

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
