
import { Transaction, CategoryRule } from '@/types/Transaction';

export const categoryRules: CategoryRule[] = [
  { id: '1', keyword: 'SAVING INTEREST', category: 'Investment Income', type: 'income' },
  { id: '2', keyword: 'TRANSFER IN', category: 'Transfer In', type: 'income' },
  { id: '3', keyword: 'SALARY', category: 'Salary', type: 'income' },
  { id: '4', keyword: 'TOKOPEDIA', category: 'Shopping', type: 'expense' },
  { id: '5', keyword: 'INDOMART', category: 'Groceries', type: 'expense' },
  { id: '6', keyword: 'BALI RESCUE', category: 'Charity', type: 'expense' },
  { id: '7', keyword: 'TRANSFER OUT', category: 'Transfer Out', type: 'expense' },
  { id: '8', keyword: 'ATM', category: 'Cash Withdrawal', type: 'expense' },
  { id: '9', keyword: 'NETFLIX', category: 'Entertainment', type: 'expense' },
  { id: '10', keyword: 'BUNGA', category: 'Bank Fees', type: 'expense' },
  { id: '11', keyword: 'ARYS MIKRO', category: 'Food & Dining', type: 'expense' },
  { id: '12', keyword: 'SAMBAL GAM', category: 'Food & Dining', type: 'expense' },
];

export const mockTransactions: Transaction[] = [
  // Neo Bank Savings (Based on uploaded image)
  {
    id: '1',
    date: '2025-04-01',
    description: 'Opening Balance',
    amount: 2828700.84,
    type: 'income',
    category: 'Transfer In',
    bank: 'Neo Savings',
    balance: 2828700.84
  },
  {
    id: '2',
    date: '2025-04-01',
    description: 'SAVING INTEREST',
    amount: 329.36,
    type: 'income',
    category: 'Investment Income',
    bank: 'Neo Savings',
    balance: 2829030.20
  },
  {
    id: '3',
    date: '2025-04-01',
    description: 'TRANSFER OUT YAYASAN BALI RESCUE DOG SQUAD',
    amount: -1000000.00,
    type: 'expense',
    category: 'Charity',
    bank: 'Neo Savings',
    balance: 1829030.20
  },
  {
    id: '4',
    date: '2025-04-07',
    description: 'TRANSFER OUT RIKKI H HASIBUAN 8580072390',
    amount: -800000.00,
    type: 'expense',
    category: 'Transfer Out',
    bank: 'Neo Savings',
    balance: 1030308.35
  },
  {
    id: '5',
    date: '2025-04-09',
    description: 'TRANSFER IN SYAFTRACO 702319838 BANK PERMATA',
    amount: 10125304.00,
    type: 'income',
    category: 'Transfer In',
    bank: 'Neo Savings',
    balance: 11155852.29
  },
  // Superbank transactions (Based on uploaded images)
  {
    id: '6',
    date: '2025-02-01',
    description: 'BI-FAST CR BIF TRANSFER DR 562 RIKKI H HASIBUAN',
    amount: 800000.00,
    type: 'income',
    category: 'Transfer In',
    bank: 'Superbank',
    balance: 912703.19
  },
  {
    id: '7',
    date: '2025-02-01',
    description: 'TARIKAN ATM 01/02',
    amount: -300000.00,
    type: 'expense',
    category: 'Cash Withdrawal',
    bank: 'Superbank',
    balance: 612703.19
  },
  {
    id: '8',
    date: '2025-02-02',
    description: 'TRANSAKSI DEBIT TGL: 01/02 QR 914 TOKOPEDIA',
    amount: -39500.00,
    type: 'expense',
    category: 'Shopping',
    bank: 'Superbank',
    balance: 573203.19
  },
  {
    id: '9',
    date: '2025-02-02',
    description: 'TRANSAKSI DEBIT TGL: 02/02 QR 914 GUSTO GELA',
    amount: -64500.00,
    type: 'expense',
    category: 'Food & Dining',
    bank: 'Superbank',
    balance: 508703.19
  },
  {
    id: '10',
    date: '2025-02-03',
    description: 'TRANSAKSI DEBIT TGL: 03/02 QRC014 INDOMART',
    amount: -25000.00,
    type: 'expense',
    category: 'Groceries',
    bank: 'Superbank',
    balance: 443703.19
  },
  {
    id: '11',
    date: '2025-02-04',
    description: 'TRANSAKSI DEBIT TGL: 04/02 QR 129 LAKLAK BAL',
    amount: -36000.00,
    type: 'expense',
    category: 'Food & Dining',
    bank: 'Superbank',
    balance: 407703.19
  },
  {
    id: '12',
    date: '2025-02-05',
    description: 'TRANSAKSI DEBIT TGL: 05/02 QRC014 INDOMART',
    amount: -31000.00,
    type: 'expense',
    category: 'Groceries',
    bank: 'Superbank',
    balance: 848703.19
  },
  {
    id: '13',
    date: '2025-02-05',
    description: 'TRSF E-BANKING DB 0502/ADSCY/WS95031 NETFLIX',
    amount: -152500.00,
    type: 'expense',
    category: 'Entertainment',
    bank: 'Superbank',
    balance: 696203.19
  },
  {
    id: '14',
    date: '2025-02-06',
    description: 'TRANSAKSI DEBIT TGL: 05/02 QR 014 MISANTO BA',
    amount: -55440.00,
    type: 'expense',
    category: 'Food & Dining',
    bank: 'Superbank',
    balance: 500063.19
  },
  {
    id: '15',
    date: '2025-02-06',
    description: 'TRSF E-BANKING DB 0602/FTSCY/WS95031 IONARI MADE OKA SURYANA',
    amount: -24000.00,
    type: 'expense',
    category: 'Transfer Out',
    bank: 'Superbank',
    balance: 431063.19
  },
  // More recent transactions
  {
    id: '16',
    date: '2025-01-15',
    description: 'SALARY DEPOSIT',
    amount: 15000000.00,
    type: 'income',
    category: 'Salary',
    bank: 'BCA',
    balance: 18500000.00
  },
  {
    id: '17',
    date: '2025-01-16',
    description: 'TRANSAKSI DEBIT TGL: ARYS MIKRO',
    amount: -85000.00,
    type: 'expense',
    category: 'Food & Dining',
    bank: 'BCA',
    balance: 18415000.00
  },
  {
    id: '18',
    date: '2025-01-18',
    description: 'BUNGA DIDAPAT',
    amount: -57056.46,
    type: 'expense',
    category: 'Bank Fees',
    bank: 'BCA',
    balance: 18357943.54
  }
];

export const categorizeTransaction = (description: string): { category: string; type: 'income' | 'expense' } => {
  const upperDesc = description.toUpperCase();
  
  for (const rule of categoryRules) {
    if (upperDesc.includes(rule.keyword.toUpperCase())) {
      return { category: rule.category, type: rule.type };
    }
  }
  
  // Default categorization
  return { category: 'Other', type: 'expense' };
};
