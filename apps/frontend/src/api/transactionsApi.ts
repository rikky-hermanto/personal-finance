import { authenticatedFetch } from '@/api/authenticatedFetch';
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
  accountName: string; // transient — from AI service, never in DB
  accountId: string;   // uuid
  amountIdr: number;
  currency: string;
  exchangeRate: number | null;
  statementBalance: number | null;
  balance: number;
  isDuplicate: boolean;
  categoryRuleDto: CategoryRuleDraft | null;
}

export interface CategoryRuleDraft {
  keyword: string;
  category: string;
  type: string;
  flow: string | null;
}

export class ApiResponseError extends Error {
  constructor(public readonly response: Response) {
    super("API Error");
  }
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

  const res = await authenticatedFetch(`${BASE_URL}?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch transactions');
  return res.json();
}

export async function getTransaction(id: number): Promise<TransactionDto> {
  const res = await authenticatedFetch(`${BASE_URL}/${id}`);
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

  const res = await authenticatedFetch(`${BASE_URL}/upload-preview`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    throw new ApiResponseError(res);
  }
  return res.json();
}

export interface BulkSuggestResult {
  description: string;
  category: string;
  confidence: number;
}

export interface CashflowImportResult {
  insertedIds: number[];
  insertedCount: number;
  duplicateCount: number;
}

export async function suggestCategoriesBulk(
  descriptions: string[],
  availableCategories: string[] = []
): Promise<BulkSuggestResult[]> {
  const res = await authenticatedFetch(`${BASE_URL}/categorize-preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ descriptions, availableCategories }),
  });
  if (!res.ok) {
    const error = Object.assign(new Error('AI categorization failed'), { response: res });
    throw error;
  }
  const data = await res.json();
  return data.results as BulkSuggestResult[];
}

export async function submitTransactions(
  transactions: TransactionDto[],
  requestId: string,
  fileHash?: string,
  fileName?: string
): Promise<CashflowImportResult> {
  const res = await authenticatedFetch(`${BASE_URL}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId, transactions, fileHash, fileName }),
  });
  if (!res.ok) {
    throw new ApiResponseError(res);
  }
  return res.json();
}

export async function getAccountSummaries(months = 12): Promise<AccountSummary[]> {
  const res = await authenticatedFetch(`${BASE_URL}/account-summaries?months=${months}`);
  if (!res.ok) throw new Error('Failed to fetch account summaries');
  return res.json();
}

export async function resolveAlias(aliasText: string): Promise<{ accountId: string; accountName: string; institutionName: string } | null> {
  const res = await authenticatedFetch(`${BASE_URL}/resolve-alias?aliasText=${encodeURIComponent(aliasText)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Failed to resolve alias');
  return res.json();
}

export async function resetAllTransactions(): Promise<{ deleted: number }> {
  const res = await authenticatedFetch(`${BASE_URL}/reset`, { method: "DELETE" });
  if (!res.ok) throw new Error("Reset failed");
  return res.json();
}

export async function getDashboardData(accountId?: string, year?: number, month?: number, months?: number): Promise<DashboardData> {
  const params = new URLSearchParams();
  if (accountId) params.append("accountId", accountId);
  if (year)      params.append("year",      year.toString());
  if (month)     params.append("month",     month.toString());
  if (months !== undefined) params.append("months", months.toString());

  const res = await authenticatedFetch(`${BASE_URL}/aggregated?${params.toString()}`);
  if (!res.ok) throw new Error("Failed to fetch dashboard data");
  return res.json();
}

export async function getCashflowStatement(months = 6, accountId?: string, groupBy = 'quarterly'): Promise<CashflowStatement> {
  const params = new URLSearchParams();
  params.append("months", months.toString());
  if (accountId) params.append("accountId", accountId);
  params.append("groupBy", groupBy);

  const res = await authenticatedFetch(`${BASE_URL}/statement?${params.toString()}`);
  if (!res.ok) throw new Error("Failed to fetch cashflow statement");
  return res.json();
}

export const exportTransactionsCsv = async (accountId?: string, from?: string, to?: string): Promise<void> => {
  const params = new URLSearchParams();
  if (accountId) params.set("accountId", accountId);
  if (from) params.set("from", from);
  if (to)   params.set("to",   to);
  const query = params.toString();
  const response = await authenticatedFetch(`${BASE_URL}/export${query ? `?${query}` : ""}`);
  if (!response.ok) throw new Error('Export failed');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `transactions-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
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
