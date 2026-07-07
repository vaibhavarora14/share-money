import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, TouchableOpacity } from "react-native";
import { useTheme } from "react-native-paper";

type HeaderIconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

interface HeaderIconButtonProps {
  icon: HeaderIconName;
  onPress: () => void;
  accessibilityLabel: string;
  testID?: string;
  color?: string;
  size?: number;
}

export const HeaderIconButton: React.FC<HeaderIconButtonProps> = ({
  icon,
  onPress,
  accessibilityLabel,
  testID,
  color,
  size = 30,
}) => {
  const theme = useTheme();

  return (
    <TouchableOpacity
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
      onPress={onPress}
      style={styles.button}
      testID={testID}
    >
      <MaterialCommunityIcons
        name={icon}
        size={size}
        color={color ?? theme.colors.onSurface}
      />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 4,
  },
});
