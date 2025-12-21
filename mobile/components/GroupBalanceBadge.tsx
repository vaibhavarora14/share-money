import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { Balance } from '../types';
import { formatCurrency } from '../utils/currency';

interface GroupBalanceData {
  group_id: string;
  balances: Balance[];
}

interface GroupBalanceBadgeProps {
  balanceData?: GroupBalanceData | null;
  currentUserId?: string | null;
  style?: ViewStyle;
}

export const GroupBalanceBadge: React.FC<GroupBalanceBadgeProps> = ({ 
  balanceData,
  currentUserId,
  style 
}) => {
  const theme = useTheme();

  // Robust null checks
  if (!balanceData || !balanceData.balances || balanceData.balances.length === 0) {
    return (
      <View style={[styles.balanceBadge, { backgroundColor: theme.colors.surfaceVariant }, style]}>
        <Text style={[styles.balanceText, { color: theme.colors.onSurfaceVariant }]}>Settled</Text>
      </View>
    );
  }

  // Filter balances
  let displayBalances = balanceData.balances;
  
  if (currentUserId) {
    // If we have a current user, only show their personal balance in this group
    displayBalances = balanceData.balances.filter(b => b.user_id === currentUserId);
  }

  // Filter out zero residues
  const nonZeroBalances = displayBalances.filter(b => Math.abs(b.amount) >= 0.01);

  if (nonZeroBalances.length === 0) {
    return (
      <View style={[styles.balanceBadge, { backgroundColor: theme.colors.surfaceVariant }, style]}>
        <Text style={[styles.balanceText, { color: theme.colors.onSurfaceVariant }]}>Settled</Text>
      </View>
    );
  }

  // Sum balances by currency (important if user has multiple residues, e.g. from invited state vs user state)
  const netBalancesMap = nonZeroBalances.reduce((acc, b) => {
    acc[b.currency] = (acc[b.currency] || 0) + b.amount;
    return acc;
  }, {} as Record<string, number>);

  const netBalances = Object.entries(netBalancesMap)
    .map(([currency, amount]) => ({ currency, amount }))
    .filter(b => Math.abs(b.amount) >= 0.01);

  if (netBalances.length === 0) {
    return (
      <View style={[styles.balanceBadge, { backgroundColor: theme.colors.surfaceVariant }, style]}>
        <Text style={[styles.balanceText, { color: theme.colors.onSurfaceVariant }]}>Settled</Text>
      </View>
    );
  }

  // Sort by absolute amount to show the most significant balance first
  netBalances.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

  const mainBalance = netBalances[0];
  const isMultiCurrency = netBalances.length > 1;
  const isPositive = mainBalance.amount > 0;
  
  const badgeColor = isPositive ? theme.colors.primaryContainer : theme.colors.errorContainer;
  const textColor = isPositive ? theme.colors.onPrimaryContainer : theme.colors.onErrorContainer;

  return (
    <View style={[styles.balanceBadge, { backgroundColor: badgeColor }, style]}>
      <Text style={[styles.balanceText, { color: textColor, fontWeight: '700' }]}>
        {isPositive ? '+' : ''}
        {formatCurrency(mainBalance.amount, mainBalance.currency)}
        {isMultiCurrency ? ' (+)' : ''}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  balanceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    minWidth: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  balanceText: {
    fontSize: 12,
    fontWeight: '500',
  },
});
