import type { Transaction } from '@/types/Transaction';

export type MissingField = 'date' | 'category' | 'description' | 'amount';

/**
 * The import function rejects the whole batch if any row has an amount of 0 or less
 * (supabase/migrations/20261009100000_pf_s08_checked_cashflow_import.sql), and a zero row moves no money.
 * Split them out up front so one of them cannot block thousands of good rows.
 */
export const splitZeroAmountRows = (rows: Transaction[]): { kept: Transaction[]; skipped: Transaction[] } => {
  const kept: Transaction[] = [];
  const skipped: Transaction[] = [];
  for (const tx of rows) (tx.amount === 0 && !tx.isDuplicate ? skipped : kept).push(tx);
  return { kept, skipped };
};

export interface RowProblem {
  tx: Transaction;
  /** 1-based position in the "Ready to Save" list, stable regardless of table filters. */
  rowNumber: number;
  missing: MissingField[];
}

export interface ImportSummary {
  /** Income rows, excluding the opening balance. */
  income: number;
  /** Expense rows (negative), excluding the opening balance. */
  expenses: number;
  /** Signed sum of transfer rows (fees, FX loss, anything that moves between accounts). */
  transfers: number;
  /** The "Initial Balance" row some master sheets start with, 0 when absent. */
  openingBalance: number;
  /** Everything added up: opening + income + expenses + transfers. Equals the sheet's last running balance. */
  netBalance: number;
  totalTransactions: number;
}

const OPENING_BALANCE = /^\s*initial\s+balance\s*$/i;

export const isOpeningBalance = (tx: Pick<Transaction, 'description'>): boolean =>
  OPENING_BALANCE.test(tx.description ?? '');

/** Rows that cannot be submitted, with the exact fields to fix. Recomputed live as the user edits. */
export const findRowProblems = (rows: Transaction[]): RowProblem[] => {
  const problems: RowProblem[] = [];
  rows.forEach((tx, i) => {
    const missing: MissingField[] = [];
    if (!tx.date) missing.push('date');
    if (!tx.description?.trim()) missing.push('description');
    if (!tx.category?.trim()) missing.push('category');
    if (!tx.amount) missing.push('amount');
    if (missing.length > 0) problems.push({ tx, rowNumber: i + 1, missing });
  });
  return problems;
};

/**
 * Income and expenses answer "what happened this period", so transfers and the opening balance stay out of them.
 * The net balance answers "where does the account end up", so it counts every row; that is the figure to
 * compare against the statement's last running balance.
 */
export const summarizeImport = (rows: Transaction[]): ImportSummary => {
  let income = 0;
  let expenses = 0;
  let transfers = 0;
  let openingBalance = 0;

  for (const tx of rows) {
    if (isOpeningBalance(tx)) openingBalance += tx.amount;
    else if (tx.type === 'income') income += tx.amount;
    else if (tx.type === 'transfer') transfers += tx.amount;
    else expenses += tx.amount;
  }

  return {
    income,
    expenses,
    transfers,
    openingBalance,
    netBalance: openingBalance + income + expenses + transfers,
    totalTransactions: rows.length,
  };
};
