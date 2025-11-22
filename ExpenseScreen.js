import React, { useEffect, useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  Button,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,         
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';

const PRIMARY = '#00b289';
const TEXT_MUTED = '#9ca3af';

export default function ExpenseScreen() {
  const db = useSQLiteContext();

  const [expenses, setExpenses] = useState([]);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');
  const [filter, setFilter] = useState('ALL');      // 'ALL' | 'WEEK' | 'MONTH'
  const [editingId, setEditingId] = useState(null); // null when not editing

  // Get today's date as "YYYY-MM-DD"
  const getTodayString = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Load all expenses from SQLite
  const loadExpenses = async () => {
    try {
      const rows = await db.getAllAsync(
        'SELECT * FROM expenses ORDER BY id DESC;'
      );
      setExpenses(rows);
    } catch (err) {
      console.error('Error loading expenses:', err);
      Alert.alert('Error', 'Failed to load expenses from the database.');
    }
  };

  // Add a new expense OR update an existing one
  const handleSaveExpense = async () => {
    // 1) Basic field checks
    if (!amount.trim()) {
      Alert.alert('Missing amount', 'Please enter an amount before saving.');
      return;
    }
    if (!category.trim()) {
      Alert.alert('Missing category', 'Please enter a category before saving.');
      return;
    }

    const amountNumber = parseFloat(amount);

    // 2) Validate numeric amount
    if (isNaN(amountNumber) || amountNumber <= 0) {
      Alert.alert('Invalid amount', 'Amount must be a number greater than 0.');
      return;
    }

    const trimmedCategory = category.trim();
    const trimmedNote = note.trim();

    // 3) Keep date when editing; otherwise use today
    const existing = expenses.find((e) => e.id === editingId);
    const dateToUse = existing?.date || getTodayString();

    try {
      if (editingId === null) {
        // INSERT
        await db.runAsync(
          'INSERT INTO expenses (amount, category, note, date) VALUES (?, ?, ?, ?);',
          [amountNumber, trimmedCategory, trimmedNote || null, dateToUse]
        );
      } else {
        // UPDATE
        await db.runAsync(
          'UPDATE expenses SET amount = ?, category = ?, note = ?, date = ? WHERE id = ?;',
          [amountNumber, trimmedCategory, trimmedNote || null, dateToUse, editingId]
        );
      }

      // 4) Reset form + exit edit mode
      setAmount('');
      setCategory('');
      setNote('');
      setEditingId(null);

      // 5) Reload list
      loadExpenses();
    } catch (err) {
      console.error('Error saving expense:', err);

      // Very likely cause if you ran the app before adding `date`:
      // existing DB table doesn’t have a `date` column.
      Alert.alert(
        'Save failed',
        'Saving the expense failed. If you see an error like "no such column: date" in Metro, you need to reset the app database (uninstall app or clear data) so the new table schema with the date column is used.'
      );
    }
  };

  // Delete expense and cancel edit if needed
  const deleteExpense = async (id) => {
    if (editingId === id) {
      setEditingId(null);
      setAmount('');
      setCategory('');
      setNote('');
    }
    try {
      await db.runAsync('DELETE FROM expenses WHERE id = ?;', [id]);
      loadExpenses();
    } catch (err) {
      console.error('Error deleting expense:', err);
      Alert.alert('Error', 'Failed to delete expense.');
    }
  };

  // Load a row into the form for editing
  const startEditExpense = (expense) => {
    setEditingId(expense.id);
    setAmount(String(expense.amount));
    setCategory(expense.category);
    setNote(expense.note || '');
  };

  // Filter expenses by All / This Week / This Month
  const getFilteredExpenses = () => {
    if (filter === 'ALL') {
      return expenses;
    }
    const today = new Date();
    const todayYear = today.getFullYear();
    const todayMonth = today.getMonth();

    if (filter === 'MONTH') {
      return expenses.filter((exp) => {
        if (!exp.date) return false;
        const d = new Date(exp.date);
        return (
          d.getFullYear() === todayYear && d.getMonth() === todayMonth
        );
      });
    }

    if (filter === 'WEEK') {
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay()); // Sunday
      startOfWeek.setHours(0, 0, 0, 0);

      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6); // Saturday
      endOfWeek.setHours(23, 59, 59, 999);

      return expenses.filter((exp) => {
        if (!exp.date) return false;
        const d = new Date(exp.date);
        return d >= startOfWeek && d <= endOfWeek;
      });
    }

    return expenses;
  };

  const filteredExpenses = getFilteredExpenses();

  // Overall total for current filter
  const totalSpending = filteredExpenses.reduce(
    (acc, exp) => acc + Number(exp.amount || 0),
    0
  );

  // Totals by category for current filter
  const categoryTotals = {};
  filteredExpenses.forEach((exp) => {
    const cat = exp.category || 'Uncategorized';
    const amt = Number(exp.amount || 0);
    if (!categoryTotals[cat]) {
      categoryTotals[cat] = 0;
    }
    categoryTotals[cat] += amt;
  });

  const filterLabel =
    filter === 'ALL' ? 'All' : filter === 'WEEK' ? 'This Week' : 'This Month';

  const renderExpense = ({ item }) => (
    <View style={styles.expenseRow}>
      <TouchableOpacity style={{ flex: 1 }} onPress={() => startEditExpense(item)}>
        <Text style={styles.expenseAmount}>
          ${Number(item.amount).toFixed(2)}
        </Text>
        <Text style={styles.expenseCategory}>{item.category}</Text>
        {item.note ? (
          <Text style={styles.expenseNote}>{item.note}</Text>
        ) : null}
        {item.date ? (
          <Text style={styles.expenseNote}>Date: {item.date}</Text>
        ) : null}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => deleteExpense(item.id)}>
        <Text style={styles.delete}>✕</Text>
      </TouchableOpacity>
    </View>
  );

  useEffect(() => {
    async function setup() {
      try {
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            amount REAL NOT NULL,
            category TEXT NOT NULL,
            note TEXT,
            date TEXT NOT NULL
          );
        `);

        await loadExpenses();
      } catch (err) {
        console.error('Error in setup:', err);
        Alert.alert('Error', 'Failed to set up the database.');
      }
    }

    setup();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.heading}>Student Expense Tracker</Text>

      {/* Filter buttons */}
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[
            styles.filterButton,
            filter === 'ALL' && styles.filterButtonActive,
          ]}
          onPress={() => setFilter('ALL')}
        >
          <Text style={styles.filterButtonText}>All</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.filterButton,
            filter === 'WEEK' && styles.filterButtonActive,
          ]}
          onPress={() => setFilter('WEEK')}
        >
          <Text style={styles.filterButtonText}>This Week</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.filterButton,
            filter === 'MONTH' && styles.filterButtonActive,
          ]}
          onPress={() => setFilter('MONTH')}
        >
          <Text style={styles.filterButtonText}>This Month</Text>
        </TouchableOpacity>
      </View>

      {/* Summary card */}
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>
          Total Spending ({filterLabel}):
        </Text>
        <Text style={styles.summaryAmount}>
          ${totalSpending.toFixed(2)}
        </Text>
        <Text style={[styles.summaryTitle, { marginTop: 8 }]}>
          By Category:
        </Text>

        {Object.keys(categoryTotals).length === 0 ? (
          <Text style={styles.summaryEmpty}>No expenses for this range.</Text>
        ) : (
          Object.entries(categoryTotals).map(([cat, total]) => (
            <Text key={cat} style={styles.summaryCategoryLine}>
              {cat}: ${total.toFixed(2)}
            </Text>
          ))
        )}
      </View>

      {/* Form */}
      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="Amount (e.g. 12.50)"
          placeholderTextColor={TEXT_MUTED}
          keyboardType="numeric"
          value={amount}
          onChangeText={setAmount}
        />

        <TextInput
          style={styles.input}
          placeholder="Category (e.g. groceries, shopping...)"
          placeholderTextColor={TEXT_MUTED}
          value={category}
          onChangeText={setCategory}
        />

        <TextInput
          style={styles.input}
          placeholder="Note (optional)"
          placeholderTextColor={TEXT_MUTED}
          value={note}
          onChangeText={setNote}
        />

        <Button
          title={editingId === null ? 'Add Expense' : 'Save Changes'}
          color={PRIMARY}
          onPress={handleSaveExpense}
        />

        {editingId !== null && (
          <View style={{ marginTop: 8 }}>
            <Button
              title="Cancel Edit"
              color={TEXT_MUTED}
              onPress={() => {
                setEditingId(null);
                setAmount('');
                setCategory('');
                setNote('');
              }}
            />
          </View>
        )}
      </View>

      {/* List */}
      <FlatList
        data={filteredExpenses}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderExpense}
        ListEmptyComponent={
          <Text style={styles.empty}>No expenses yet.</Text>
        }
      />

      <Text style={styles.footer}>
        Enter your expenses and they’ll be saved locally with SQLite.
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#111827' },
  heading: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 16,
  },
  form: {
    marginBottom: 16,
    gap: 8,
  },
  input: {
    padding: 10,
    backgroundColor: '#1f2937',
    color: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#374151',
  },
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1f2937',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  expenseAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: '#aaee50ff',
  },
  expenseCategory: {
    fontSize: 14,
    color: '#e5e7eb',
  },
  expenseNote: {
    fontSize: 12,
    color: '#9ca3af',
  },
  delete: {
    color: '#f87171',
    fontSize: 20,
    marginLeft: 12,
  },
  empty: {
    color: '#9ca3af',
    marginTop: 24,
    textAlign: 'center',
  },
  footer: {
    textAlign: 'center',
    color: '#6b7280',
    marginTop: 12,
    fontSize: 12,
  },
  filterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  filterButton: {
    flex: 1,
    paddingVertical: 8,
    marginHorizontal: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#4b5563',
    alignItems: 'center',
  },
  filterButtonActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  filterButtonText: {
    color: '#e5e7eb',
    fontSize: 12,
    fontWeight: '600',
  },
  summaryCard: {
    backgroundColor: '#1f2937',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  summaryTitle: {
    color: '#9ca3af',
    fontSize: 12,
  },
  summaryAmount: {
    color: '#aaee50ff',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 4,
  },
  summaryCategoryLine: {
    color: '#e5e7eb',
    fontSize: 12,
  },
  summaryEmpty: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 4,
  },
});
