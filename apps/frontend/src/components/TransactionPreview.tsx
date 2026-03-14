import { useState, useMemo } from 'react';
import { Transaction, CategoryRule } from '@/types/Transaction';
import { Button } from '@/components/ui/button';
import { Edit2, Check, X, Send } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import * as transactionsApi from '@/api/transactionsApi';

interface TransactionPreviewProps {
  transactions: Transaction[];
  onConfirm: (transactions: Transaction[]) => void;
  onBack: () => void;
}

const CORE_CATEGORIES = [
  'Food & Dining',
  'Transportation',
  'Shopping',
  'Entertainment',
  'Bills & Utilities',
  'Healthcare',
  'Travel',
  'Education',
  'Groceries',
  'Gas & Fuel',
  'Income',
  'Transfer',
  'Investment',
  'Insurance',
  'Other'
];

const TransactionPreview = ({ transactions, onConfirm, onBack }: TransactionPreviewProps) => {
  const [editedTransactions, setEditedTransactions] = useState<Transaction[]>(transactions);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(Math.abs(amount));
  };

  const formatDate = (dateString: string) => {
    // Only take the date part, ignore time and timezone
    return new Date(dateString).toISOString().slice(0, 10).split('-').reverse().join(' ');
  };

  const handleCategoryChange = (transactionId: string, newCategory: string) => {
    setEditedTransactions(prev =>
      prev.map(transaction =>
        transaction.id === transactionId
          ? { ...transaction, category: newCategory }
          : transaction
      )
    );
    setEditingId(null);
  };

  const summary = useMemo(() => {
    const income = editedTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);
    
    const expenses = editedTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);

    return {
      income,
      expenses,
      balance: income - expenses,
      totalTransactions: editedTransactions.length
    };
  }, [editedTransactions]);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setApiError(null);
    try {
      // Map editedTransactions to TransactionDto shape for API with proper type casting
      const payload: transactionsApi.TransactionDto[] = editedTransactions.map(t => ({
        id: 0,
        date: t.date,
        description: t.description,
        remarks: "",
        flow: t.flow,
        type: t.type.charAt(0).toUpperCase() + t.type.slice(1),
        category: t.category,
        wallet: t.bank,
        amountIdr: Math.abs(t.amount),
        currency: "IDR",
        exchangeRate: null,
        balance: 0,
        categoryRuleDto: null
      }));
      await transactionsApi.submitTransactions(payload);
      onConfirm(editedTransactions);
    } catch (error: any) {
      let message = "Failed to submit transactions";
      try {
         // Try to parse the error response if available
        if (error?.response && typeof error.response.json === 'function') {
          const data = await error.response.json();
          if (data?.Message) {
            message = message + (data.Detail ? `: ${data.Detail}` : "");
          }
        } else if (error instanceof Error && error.message) {
          // Try to parse error.message as JSON if possible
          try {
            const data = JSON.parse(error.message);
            if (data?.Message) {
              message = message + (data.Detail ? `: ${data.Detail}` : "");
            }
          } catch {
            message = error.message;
          }
        }
      } catch {
        // fallback to default message
      }
      setApiError(message);
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-4">Preview Parsed Data</h2>
        <p className="text-gray-600 mb-6">
          Review the parsed transactions below. Categories have been automatically assigned. 
          You can edit any category before submitting.
        </p>
        
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-600 mb-1">Total Transactions</h3>
            <p className="text-2xl font-bold text-gray-900">{summary.totalTransactions}</p>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <h3 className="text-sm font-medium text-green-600 mb-1">Income</h3>
            <p className="text-2xl font-bold text-green-900">+{formatCurrency(summary.income)}</p>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <h3 className="text-sm font-medium text-red-600 mb-1">Expenses</h3>
            <p className="text-2xl font-bold text-red-900">-{formatCurrency(summary.expenses)}</p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-600 mb-1">Net Balance</h3>
            <p className={`text-2xl font-bold ${summary.balance >= 0 ? 'text-green-900' : 'text-red-900'}`}>
              {summary.balance >= 0 ? '+' : ''}{formatCurrency(summary.balance)}
            </p>
          </div>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="rounded-lg shadow-sm border border-gray-200 mb-6">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Bank</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {editedTransactions.map((transaction) => (
                <TableRow key={transaction.id}>
                  <TableCell className="whitespace-nowrap">
                    {formatDate(transaction.date)}
                  </TableCell>
                  <TableCell className="max-w-xs truncate">
                    {transaction.description}
                  </TableCell>
                  <TableCell>
                    {editingId === transaction.id ? (
                      <Select
                        value={transaction.category}
                        onValueChange={(value) => handleCategoryChange(transaction.id, value)}
                      >
                        <SelectTrigger className="w-48">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CORE_CATEGORIES.map(category => (
                            <SelectItem key={category} value={category}>
                              {category}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        {transaction.category}
                      </span>
                    )}
                  </TableCell>
                  <TableCell
                    className={`font-medium ${
                      transaction.flow === 'CR' ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    {transaction.flow === 'CR' ? '+' : '-'}
                    {formatCurrency(Math.abs(transaction.amount))}
                  </TableCell>
                  <TableCell className="text-gray-500">
                    {transaction.bank}
                  </TableCell>
                  <TableCell>
                    {editingId === transaction.id ? (
                      <div className="flex space-x-1">
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-green-600 hover:text-green-800"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-gray-600 hover:text-gray-800"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setEditingId(transaction.id)}
                        className="text-gray-600 hover:text-gray-800"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Error Message */}
      {apiError && (
        <div className="mb-4 p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm">
          {apiError}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-4 justify-center">
        <Button onClick={onBack} variant="outline" className="border-gray-300 text-gray-700 hover:bg-gray-50">
          Back to Files
        </Button>
        <Button
          onClick={handleSubmit}
          className="bg-gray-900 hover:bg-gray-800 text-white"
          disabled={isSubmitting}
        >
          <Send className="w-4 h-4 mr-2" />
          {isSubmitting ? "Submitting..." : `Submit Data (${editedTransactions.length} transactions)`}
        </Button>
      </div>
    </div>
  );
};

export default TransactionPreview;
