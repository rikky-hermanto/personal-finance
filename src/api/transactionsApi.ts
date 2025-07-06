const BASE_URL = "https://localhost:7208/api/transactions";

export interface TransactionDto {
  id: number;
  date: string;
  description: string;
  remarks: string;
  flow: string;
  type: string;
  category: string;
  wallet: string;
  amountIdr: number;
  currency: string;
  exchangeRate: number | null;
  balance: number;
  categoryRuleDto: any;
}

export async function getTransactions(): Promise<TransactionDto[]> {
  const res = await fetch(BASE_URL);
  if (!res.ok) throw new Error("Failed to fetch transactions");
  return res.json();
}

export async function getTransaction(id: number): Promise<TransactionDto> {
  const res = await fetch(`${BASE_URL}/${id}`);
  if (!res.ok) throw new Error("Failed to fetch transaction");
  return res.json();
}

export async function addTransaction(transaction: Omit<TransactionDto, "id">): Promise<TransactionDto> {
  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(transaction),
  });
  if (!res.ok) throw new Error("Failed to add transaction");
  return res.json();
}

export async function updateTransaction(id: number, transaction: Partial<TransactionDto>): Promise<TransactionDto> {
  const res = await fetch(`${BASE_URL}/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(transaction),
  });
  if (!res.ok) throw new Error("Failed to update transaction");
  return res.json();
}

export async function deleteTransaction(id: number): Promise<void> {
  const res = await fetch(`${BASE_URL}/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete transaction");
}

/**
 * Uploads a bank statement file for preview (parsing, not saving to DB yet).
 * @param file The CSV or PDF file to upload.
 * @param pdfPassword Optional PDF password if needed.
 * @returns Promise<TransactionDto[]> - parsed transactions for preview.
 */
export async function uploadPreview(
  file: File,
  pdfPassword?: string
): Promise<TransactionDto[]> {
  const formData = new FormData();
  formData.append("file", file);
  if (pdfPassword) {
    formData.append("pdfPassword", pdfPassword);
  }

  const res = await fetch(`${BASE_URL}/upload-preview`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) throw new Error("Failed to upload and preview file");
  return res.json();
}

export async function submitTransactions(transactions: TransactionDto[]): Promise<void> {
  const res = await fetch(`${BASE_URL}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(transactions),
  });
  if (!res.ok) {
    const error: any = new Error("API Error");
    error.response = res;
    throw error;
  }
}