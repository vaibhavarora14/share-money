import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useState, useEffect } from 'react';
import { Transaction, AmountInfo } from './types';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AuthScreen } from './screens/AuthScreen';

// Update this URL to your Netlify Edge Function URL
// For local development: http://192.168.0.215:8888/api/transactions
// For production: https://sharemoney-app.netlify.app/api/transactions
const API_URL = __DEV__ 
  ? 'http://192.168.0.215:8888/api/transactions' 
  : 'https://sharemoney-app.netlify.app/api/transactions';

function TransactionsScreen() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const { session, signOut } = useAuth();

  useEffect(() => {
    if (session) {
      fetchTransactions();
    }
  }, [session]);

  const fetchTransactions = async (): Promise<void> => {
    if (!session) return;

    try {
      setLoading(true);
      setError(null);
      
      // Get the access token from the session
      const token = session.access_token;
      
      const response = await fetch(API_URL, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        if (response.status === 401) {
          // Token expired or invalid, sign out
          await signOut();
          return;
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data: Transaction[] = await response.json();
      setTransactions(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      console.error('Error fetching transactions:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const formatAmount = (amount: number, type: 'income' | 'expense'): AmountInfo => {
    const sign = type === 'income' ? '+' : '-';
    const color = type === 'income' ? '#10b981' : '#ef4444';
    return { text: `${sign}$${Math.abs(amount).toFixed(2)}`, color };
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Loading transactions...</Text>
        <StatusBar style="auto" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Error: {error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchTransactions}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
        <StatusBar style="auto" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerTitle}>Transactions</Text>
            <Text style={styles.headerSubtitle}>{transactions.length} transactions</Text>
          </View>
          <TouchableOpacity style={styles.signOutButton} onPress={signOut}>
            <Text style={styles.signOutButtonText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </View>
      
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {transactions.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No transactions found</Text>
            <Text style={styles.emptySubtext}>Your transactions will appear here</Text>
          </View>
        ) : (
          transactions.map((transaction: Transaction) => {
            const amountInfo = formatAmount(transaction.amount, transaction.type);
            return (
              <View key={transaction.id} style={styles.transactionCard}>
                <View style={styles.transactionLeft}>
                  <Text style={styles.transactionDescription}>{transaction.description}</Text>
                  <View style={styles.transactionMeta}>
                    <Text style={styles.transactionDate}>{formatDate(transaction.date)}</Text>
                    {transaction.category && (
                      <Text style={styles.transactionCategory}> • {transaction.category}</Text>
                    )}
                  </View>
                </View>
                <View style={styles.transactionRight}>
                  <Text style={[styles.transactionAmount, { color: amountInfo.color }]}>
                    {amountInfo.text}
                  </Text>
                  <View style={[styles.typeBadge, { 
                    backgroundColor: transaction.type === 'income' ? '#d1fae5' : '#fee2e2' 
                  }]}>
                    <Text style={[styles.typeText, { 
                      color: transaction.type === 'income' ? '#065f46' : '#991b1b' 
                    }]}>
                      {transaction.type}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
      
      <StatusBar style="auto" />
    </View>
  );
}

function AppContent() {
  const { session, loading } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <StatusBar style="auto" />
      </View>
    );
  }

  if (!session) {
    return (
      <>
        <AuthScreen isSignUp={isSignUp} onToggleMode={() => setIsSignUp(!isSignUp)} />
        <StatusBar style="auto" />
      </>
    );
  }

  return <TransactionsScreen />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
    paddingTop: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#6b7280',
  },
  signOutButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#ef4444',
  },
  signOutButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6b7280',
  },
  errorText: {
    fontSize: 16,
    color: '#ef4444',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    color: '#6b7280',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9ca3af',
  },
  transactionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  transactionLeft: {
    flex: 1,
    marginRight: 12,
  },
  transactionDescription: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 6,
  },
  transactionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  transactionDate: {
    fontSize: 14,
    color: '#6b7280',
  },
  transactionCategory: {
    fontSize: 14,
    color: '#9ca3af',
  },
  transactionRight: {
    alignItems: 'flex-end',
  },
  transactionAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  typeText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
});
