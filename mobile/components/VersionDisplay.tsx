import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import React from 'react';
import { Platform, StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { useTheme } from 'react-native-paper';

/**
 * VersionDisplay Component
 * 
 * Displays the app version and build number.
 * Can be used in Settings/About screens or debug menus.
 * 
 * Usage:
 *   <VersionDisplay />
 *   <VersionDisplay showBuildDate />
 *   <VersionDisplay variant="compact" />
 */
interface VersionDisplayProps {
  /**
   * Show build date (requires expo-constants)
   */
  showBuildDate?: boolean;
  
  /**
   * Display variant
   * - 'default': Full version info with labels
   * - 'compact': Just version and build number
   */
  variant?: 'default' | 'compact';
  
  /**
   * Custom style (ViewStyle for default variant, TextStyle for compact variant)
   */
  style?: StyleProp<ViewStyle | TextStyle>;
}

function getNativeUpdateId(): string | null {
  if (Platform.OS === 'web') {
    return null;
  }
  if (!Updates.isEnabled) {
    return null;
  }
  return Updates.updateId ?? null;
}

function formatUpdateId(updateId: string): string {
  return updateId.replace(/-/g, '').slice(0, 8);
}

export const VersionDisplay: React.FC<VersionDisplayProps> = ({
  showBuildDate = false,
  variant = 'default',
  style,
}) => {
  const theme = useTheme();
  
  const version = Constants.expoConfig?.version || 'Unknown';
  const buildNumber = 
    Constants.expoConfig?.ios?.buildNumber || 
    Constants.expoConfig?.android?.versionCode || 
    'Unknown';
  const updateId = getNativeUpdateId();
  const shortUpdateId = updateId ? formatUpdateId(updateId) : null;
  
  const buildDate = showBuildDate && Constants.expoConfig?.extra?.buildDate
    ? new Date(Constants.expoConfig.extra.buildDate).toLocaleDateString()
    : null;

  if (variant === 'compact') {
    const compactLabel = shortUpdateId
      ? `Version ${version}, Build ${buildNumber}, Update ${shortUpdateId}`
      : `Version ${version}, Build ${buildNumber}`;
    return (
      <Text 
        style={[styles.compactText, { color: theme.colors.onSurfaceVariant }, style]}
        accessibilityLabel={compactLabel}
      >
        {shortUpdateId
          ? `v${version} (${buildNumber}) · ${shortUpdateId}`
          : `v${version} (${buildNumber})`}
      </Text>
    );
  }

  return (
    <View style={[styles.container, style]} accessibilityRole="text">
      <Text 
        style={[styles.label, { color: theme.colors.onSurfaceVariant }]}
        accessibilityRole="text"
      >
        Version
      </Text>
      <Text 
        style={[styles.value, { color: theme.colors.onSurface }]}
        accessibilityLabel={`Version ${version}`}
      >
        {version}
      </Text>
      
      <Text 
        style={[styles.label, { color: theme.colors.onSurfaceVariant }]}
        accessibilityRole="text"
      >
        Build
      </Text>
      <Text 
        style={[styles.value, { color: theme.colors.onSurface }]}
        accessibilityLabel={`Build ${buildNumber}`}
      >
        {buildNumber}
      </Text>

      {shortUpdateId && (
        <>
          <Text 
            style={[styles.label, { color: theme.colors.onSurfaceVariant }]}
            accessibilityRole="text"
          >
            Update
          </Text>
          <Text 
            style={[styles.value, { color: theme.colors.onSurface }]}
            accessibilityLabel={`Update ${shortUpdateId}`}
          >
            {shortUpdateId}
          </Text>
        </>
      )}
      
      {buildDate && (
        <>
          <Text 
            style={[styles.label, { color: theme.colors.onSurfaceVariant }]}
            accessibilityRole="text"
          >
            Build Date
          </Text>
          <Text 
            style={[styles.value, { color: theme.colors.onSurface }]}
            accessibilityLabel={`Build date ${buildDate}`}
          >
            {buildDate}
          </Text>
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  label: {
    fontSize: 12,
    marginTop: 8,
    marginBottom: 4,
  },
  value: {
    fontSize: 14,
    fontWeight: '500',
  },
  compactText: {
    fontSize: 12,
    textAlign: 'center',
  },
});
