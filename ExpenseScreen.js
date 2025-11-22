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
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';

export default function ExpenseScreen() {
  const db = useSQLiteContext();

  const [expenses, setExpenses] = useState([]);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');
  const [filter, setFilter] = useState('ALL');    
  const [editingId, setEditingId] = useState(null);

  const getTodayString = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0'); 
  const day = String(today.getDate()).padStart(2, '0');       
  return `${year}-${month}-${day}`;
  };

  const loadExpenses = async () => {
    const rows = await db.getAllAsync(
      'SELECT * FROM expenses ORDER BY id DESC;'
    );
    setExpenses(rows);
  };
  const handleSaveExpense = async () => {
    const amountNumber = parseFloat(amount);

    if (isNaN(amountNumber) || amountNumber <= 0) {
      return;
    }

    const trimmedCategory = category.trim();
    const trimmedNote = note.trim();

    if (!trimmedCategory) {
      return;
    }

    const existing = expenses.find((e) => e.id === editingId);
    const dateToUse = existing?.date || getTodayString();

    if (editingId === null) {
      await db.runAsync(
        'INSERT INTO expenses (amount, category, note, date) VALUES (?, ?, ?, ?);',
        [amountNumber, trimmedCategory, trimmedNote || null, dateToUse]
      );
    } else {
      await db.runAsync(
        'UPDATE expenses SET amount = ?, category = ?, note = ?, date = ? WHERE id = ?;',
        [amountNumber, trimmedCategory, trimmedNote || null, dateToUse, editingId]
      );
    } 
  
    setAmount('');
    setCategory('');
    setNote('');
    setEditingId(null);
    
    loadExpenses();
  };

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
      startOfWeek.setDate(today.getDate() - today.getDay()); 
      startOfWeek.setHours(0, 0, 0, 0);

      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
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

  const totalSpending = filteredExpenses.reduce(
    (acc, exp) => acc + Number(exp.amount || 0), 0
  );

  const categoryTotals = {};
  filteredExpenses.forEach((exp) => {
    const cat = exp.category || 'Uncategorized';
    const amt = Number(exp.amount || 0);
    if (!categoryTotals[cat]) {
      categoryTotals[cat] = 0;
    }
    categoryTotals[cat] += amt;
  });

  const filterLabel = filter === 'ALL' ? 'All' : filter === 'WEEK' ? 'This Week' : 'This Month';

  const deleteExpense = async (id) => {
    await db.runAsync('DELETE FROM expenses WHERE id = ?;', [id]);
    loadExpenses();
  };

  const startEditExpense = (expense) => {
    setEditingId(expense.id);
    setAmount(String(expense.amount));
    setCategory(expense.category);
    setNote(expense.note || '');
  };


  const renderExpense = ({ item }) => (
    <View style={styles.expenseRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.expenseAmount}>${Number(item.amount).toFixed(2)}</Text>
        <Text style={styles.expenseCategory}>{item.category}</Text>
        {item.note ? <Text style={styles.expenseNote}>{item.note}</Text> : null}
      </View>

      <TouchableOpacity onPress={() => deleteExpense(item.id)}>
        <Text style={styles.delete}>✕</Text>
      </TouchableOpacity>
    </View>
  );

  useEffect(() => {
    async function setup() {
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
    }

    setup();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.heading}>Student Expense Tracker</Text>

      <View style={styles.filterRow}>
        <TouchableOpacity style={[styles.filterButton, filter === 'ALL' && styles.filterButtonActive,]} onPress={() => setFilter('ALL')}>
          <Text style={styles.filterButtonText}>All</Text>

        </TouchableOpacity>

        <TouchableOpacity style={[styles.filterButton, filter === 'WEEK' && styles.filterButtonActive,]} onPress={() => setFilter('WEEK')}>
          <Text style={styles.filterButtonText}>This Week</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.filterButton, filter === 'MONTH' && styles.filterButtonActive,]} onPress={() => setFilter('MONTH')}>
          <Text style={styles.filterButtonText}>This Month</Text>
        </TouchableOpacity>
      </View>

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
    color: '#fbbf24',
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
});