import React, { useEffect, useState } from "react";
import { Platform } from "react-native";
import { Button, Dialog, Portal, Text, useTheme } from "react-native-paper";
import { AlertAction, setWebAlertListener } from "../utils/alert";

interface PendingAlert {
  title: string;
  message: string;
  actions: AlertAction[];
}

/**
 * Renders showAlert() calls as a Paper Dialog on web, where React Native's
 * Alert.alert is a no-op. Mounted once at the app root (inside PaperProvider
 * so Portal works). Renders nothing on native platforms.
 */
export const AlertHost: React.FC = () => {
  const [alert, setAlert] = useState<PendingAlert | null>(null);
  const theme = useTheme();

  useEffect(() => {
    if (Platform.OS !== "web") return;
    setWebAlertListener((title, message, actions) =>
      setAlert({ title, message, actions })
    );
    return () => setWebAlertListener(null);
  }, []);

  if (Platform.OS !== "web" || !alert) {
    return null;
  }

  const close = () => setAlert(null);

  const handleDismiss = () => {
    // Backdrop click / Escape behaves like pressing the cancel action.
    const cancelAction = alert.actions.find((a) => a.style === "cancel");
    close();
    cancelAction?.onPress?.();
  };

  return (
    <Portal>
      <Dialog visible onDismiss={handleDismiss}>
        <Dialog.Title>{alert.title}</Dialog.Title>
        {alert.message ? (
          <Dialog.Content>
            <Text variant="bodyMedium">{alert.message}</Text>
          </Dialog.Content>
        ) : null}
        <Dialog.Actions>
          {alert.actions.map((action) => (
            <Button
              key={action.text}
              onPress={() => {
                close();
                action.onPress?.();
              }}
              mode={action.style === "destructive" ? "contained" : "text"}
              buttonColor={
                action.style === "destructive" ? theme.colors.error : undefined
              }
              textColor={
                action.style === "destructive" ? theme.colors.onError : undefined
              }
            >
              {action.text}
            </Button>
          ))}
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
};
