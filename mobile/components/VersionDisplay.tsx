import Constants from 'expo-constants';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
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
   * Custom text style
   */
  style?: any;
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
  
  const buildDate = showBuildDate && Constants.expoConfig?.extra?.buildDate
    ? new Date(Constants.expoConfig.extra.buildDate).toLocaleDateString()
    : null;

  if (variant === 'compact') {
    return (
      <Text style={[styles.compactText, { color: theme.colors.onSurfaceVariant }, style]}>
        v{version} ({buildNumber})
      </Text>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <Text style={[styles.label, { color: theme.colors.onSurfaceVariant }]}>
        Version
      </Text>
      <Text style={[styles.value, { color: theme.colors.onSurface }]}>
        {version}
      </Text>
      
      <Text style={[styles.label, { color: theme.colors.onSurfaceVariant }]}>
        Build
      </Text>
      <Text style={[styles.value, { color: theme.colors.onSurface }]}>
        {buildNumber}
      </Text>
      
      {buildDate && (
        <>
          <Text style={[styles.label, { color: theme.colors.onSurfaceVariant }]}>
            Build Date
          </Text>
          <Text style={[styles.value, { color: theme.colors.onSurface }]}>
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
