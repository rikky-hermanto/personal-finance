const BASE_URL = "https://localhost:7208/api/transactions";

export interface TransactionDto {
  id: number;
  date: string;
  description: string;
  remarks: string;
  flow: "CR" | "DB";
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