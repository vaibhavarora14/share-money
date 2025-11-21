import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon, Surface, Text, TouchableRipple, useTheme } from 'react-native-paper';
import { Balance, Transaction } from '../types';
import { formatCurrency } from '../utils/currency';

interface GroupDashboardProps {
  balances: Balance[];
  transactions: Transaction[];
  currentUserId?: string;
  loading: boolean;
  defaultCurrency?: string;
  onOwePress?: () => void;
  onOwedPress?: () => void;
}

export const GroupDashboard: React.FC<GroupDashboardProps> = ({
  balances,
  transactions,
  currentUserId,
  loading,
  defaultCurrency = 'USD',
  onOwePress,
  onOwedPress,
}) => {
  const theme = useTheme();

  const { youOwe, youAreOwed } = useMemo(() => {
    let owe = 0;
    let owed = 0;
    balances.forEach((b) => {
      if (b.amount < 0) owe += Math.abs(b.amount);
      else owed += b.amount;
    });
    return { youOwe: owe, youAreOwed: owed };
  }, [balances]);

  const { myCost, totalGroupCost } = useMemo(() => {
    let total = 0;
    let myTotal = 0;

    transactions.forEach((t) => {
      total += t.amount;

      if (t.splits && t.splits.length > 0) {
        const mySplit = t.splits.find((s) => s.user_id === currentUserId);
        if (mySplit) {
          myTotal += mySplit.amount;
        }
      } else if (t.split_among && t.split_among.length > 0) {
        if (t.split_among.includes(currentUserId || '')) {
          myTotal += t.amount / t.split_among.length;
        }
      }
    });

    return { myCost: myTotal, totalGroupCost: total };
  }, [transactions, currentUserId]);

  const renderCard = (
    title: string,
    amount: number,
    backgroundColor: string,
    textColor: string,
    icon: string,
    loadingState: boolean,
    onPress?: () => void
  ) => (
    <Surface style={[styles.card, { backgroundColor }]} elevation={2}>
      <TouchableRipple 
        onPress={onPress} 
        disabled={!onPress}
        style={{ flex: 1 }}
        rippleColor={textColor + '20'}
      >
        <View style={styles.cardContent}>
          <View style={styles.cardHeader}>
            <Text variant="labelMedium" style={{ color: textColor, opacity: 0.8, fontWeight: '600' }}>
              {title}
            </Text>
            <Icon source={icon} size={20} color={textColor} />
          </View>
          <Text variant="headlineSmall" style={{ color: textColor, fontWeight: 'bold', marginTop: 8 }}>
            {loadingState ? '...' : formatCurrency(amount, defaultCurrency)}
          </Text>
        </View>
      </TouchableRipple>
    </Surface>
  );

  return (
    <View style={styles.container}>
      {/* Row 1: Balances */}
      <View style={styles.row}>
        <View style={styles.column}>
          {renderCard(
            'I\'m owed',
            youAreOwed,
            '#dcfce7', // Light green bg
            '#15803d', // Dark green text
            'arrow-bottom-left',
            loading,
            onOwedPress
          )}
        </View>
        <View style={styles.column}>
          {renderCard(
            'I owe',
            youOwe,
            '#fee2e2', // Light red bg
            '#b91c1c', // Dark red text
            'arrow-top-right',
            loading,
            onOwePress
          )}
        </View>
      </View>

      {/* Row 2: Costs */}
      <View style={styles.row}>
        <View style={styles.column}>
          {renderCard(
            'My costs',
            myCost,
            '#e0f2fe', // Light blue bg
            '#0369a1', // Dark blue text
            'account',
            loading
          )}
        </View>
        <View style={styles.column}>
          {renderCard(
            'Total costs',
            totalGroupCost,
            '#f3e8ff', // Light purple bg
            '#7e22ce', // Dark purple text
            'chart-box',
            loading
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  column: {
    flex: 1,
  },
  card: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  cardContent: {
    padding: 16,
    minHeight: 100,
    justifyContent: 'space-between',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
});
