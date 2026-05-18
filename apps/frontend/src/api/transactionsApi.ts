import { DashboardData } from '@/types/Dashboard';
import { CashflowStatement } from '@/types/CashflowStatement';
const API_BASE_URL = import.meta.env.VITE_API_URL || "https://localhost:7209";
const BASE_URL = `${API_BASE_URL}/api/transactions`;

export interface TransactionDto {
  id: number;
  date: string;
  description: string;
  remarks: string;
  flow: string;
  type: string;
  category: string;
  wallet: string;      // transient — from AI service, never in DB
  accountId: string;   // uuid
  amountIdr: number;
  currency: string;
  exchangeRate: number | null;
  balance: number;
  isDuplicate: boolean;
  categoryRuleDto: any;
}

export interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TransactionQuery {
  page?: number;
  pageSize?: number;
  accountId?: string;
  search?: string;
  category?: string;
  type?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface AccountSummary {
  accountId: string;
  accountName: string;
  institutionId: string | null;
  institutionName: string;
  currency: string;
  totalIn: number;
  totalOut: number;
  netPosition: number;
  transactionCount: number;
}

export async function getTransactionPage(q: TransactionQuery = {}): Promise<PagedResult<TransactionDto>> {
  const params = new URLSearchParams();
  if (q.page)      params.set('page',      String(q.page));
  if (q.pageSize)  params.set('pageSize',  String(q.pageSize));
  if (q.accountId) params.set('accountId', q.accountId);
  if (q.search)    params.set('search',    q.search);
  if (q.category)  params.set('category',  q.category);
  if (q.type)      params.set('type',      q.type);
  if (q.sortOrder) params.set('sortOrder', q.sortOrder);

  const res = await fetch(`${BASE_URL}?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch transactions');
  return res.json();
}

export async function getTransaction(id: number): Promise<TransactionDto> {
  const res = await fetch(`${BASE_URL}/${id}`);
  if (!res.ok) throw new Error("Failed to fetch transaction");
  return res.json();
}

export async function uploadPreview(
  file: File,
  pdfPassword?: string,
  bankHint?: string,
  dateFormat?: string
): Promise<{ transactions: TransactionDto[], hash: string }> {
  const formData = new FormData();
  formData.append("file", file);
  if (pdfPassword) formData.append("pdfPassword", pdfPassword);
  if (bankHint)    formData.append("bankHint",    bankHint);
  if (dateFormat)  formData.append("dateFormat",  dateFormat);

  const res = await fetch(`${BASE_URL}/upload-preview`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const error: any = new Error("API Error");
    error.response = res;
    throw error;
  }
  return res.json();
}

export async function submitTransactions(
  transactions: TransactionDto[],
  fileHash?: string,
  fileName?: string
): Promise<void> {
  const res = await fetch(`${BASE_URL}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transactions, fileHash, fileName }),
  });
  if (!res.ok) {
    const error: any = new Error("API Error");
    error.response = res;
    throw error;
  }
}

export async function getAccountSummaries(months = 12): Promise<AccountSummary[]> {
  const res = await fetch(`${BASE_URL}/account-summaries?months=${months}`);
  if (!res.ok) throw new Error('Failed to fetch account summaries');
  return res.json();
}

export async function resolveAlias(aliasText: string): Promise<{ accountId: string; accountName: string; institutionName: string } | null> {
  const res = await fetch(`${BASE_URL}/resolve-alias?aliasText=${encodeURIComponent(aliasText)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Failed to resolve alias');
  return res.json();
}

export async function resetAllTransactions(): Promise<{ deleted: number }> {
  const res = await fetch(`${BASE_URL}/reset`, { method: "DELETE" });
  if (!res.ok) throw new Error("Reset failed");
  return res.json();
}

export async function getDashboardData(accountId?: string, year?: number, month?: number, months?: number): Promise<DashboardData> {
  const params = new URLSearchParams();
  if (accountId) params.append("accountId", accountId);
  if (year)      params.append("year",      year.toString());
  if (month)     params.append("month",     month.toString());
  if (months !== undefined) params.append("months", months.toString());

  const res = await fetch(`${BASE_URL}/aggregated?${params.toString()}`);
  if (!res.ok) throw new Error("Failed to fetch dashboard data");
  return res.json();
}

export async function getCashflowStatement(months = 6, accountId?: string, groupBy = 'quarterly'): Promise<CashflowStatement> {
  const params = new URLSearchParams();
  params.append("months", months.toString());
  if (accountId) params.append("accountId", accountId);
  params.append("groupBy", groupBy);

  const res = await fetch(`${BASE_URL}/statement?${params.toString()}`);
  if (!res.ok) throw new Error("Failed to fetch cashflow statement");
  return res.json();
}

export const exportTransactionsCsv = (accountId?: string, from?: string, to?: string): void => {
  const params = new URLSearchParams();
  if (accountId) params.set("accountId", accountId);
  if (from) params.set("from", from);
  if (to)   params.set("to",   to);
  const query = params.toString();
  window.location.href = `${BASE_URL}/export${query ? `?${query}` : ""}`;
};

const TEMPLATE_HEADERS = [
  "Date", "Item", "Remarks", "Flow", "Type",
  "Category", "Bank Account", "Amount", "Exc. Rate", "Amount (IDR)", "Balance",
];

const TEMPLATE_ROWS = [
  ["1/1/2026 09:00", "Sample Expense", "Coffee shop", "DB", "Expense", "Food & Drinks", "BCA", "50000", "", "50000", "1000000"],
  ["1/2/2026 10:00", "Sample Income", "Monthly salary", "CR", "Income", "Salary", "Bank Jago", "5000000", "", "5000000", "6000000"],
  ["1/3/2026 11:00", "Sample Transfer", "To savings", "DB", "Transfer", "Bank Transfer", "BCA", "100000", "", "100000", "5900000"],
];

export const downloadTransactionTemplate = (): void => {
  const csvContent = [TEMPLATE_HEADERS, ...TEMPLATE_ROWS]
    .map(row => row.map(cell => (cell.includes(",") ? `"${cell}"` : cell)).join(","))
    .join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "transaction-template.csv";
  link.click();
  URL.revokeObjectURL(url);
};
