const API_BASE_URL = import.meta.env.VITE_API_URL || "https://localhost:7209";
const BASE_URL = `${API_BASE_URL}/api/categoryrules`;

export interface CategoryRuleDto {
  id: number;
  keyword: string;
  type: string;
  category: string;
  keywordLength: number;
}

export async function getCategoryRules(): Promise<CategoryRuleDto[]> {
  const res = await fetch(BASE_URL);
  if (!res.ok) throw new Error("Failed to fetch category rules");
  return res.json();
}

export async function addCategoryRule(rule: Omit<CategoryRuleDto, "id" | "keywordLength">): Promise<CategoryRuleDto> {
  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(rule),
  });
  if (!res.ok) throw new Error("Failed to add category rule");
  return res.json();
}

export async function updateCategoryRule(id: number, rule: Omit<CategoryRuleDto, "id" | "keywordLength">): Promise<CategoryRuleDto> {
  const res = await fetch(`${BASE_URL}/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(rule),
  });
  if (!res.ok) throw new Error("Failed to update category rule");
  return res.json();
}

export async function deleteCategoryRule(id: number): Promise<void> {
  const res = await fetch(`${BASE_URL}/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete category rule");
}

export async function resetAllCategoryRules(): Promise<{ message: string }> {
  const res = await fetch(`${BASE_URL}/reset`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to reset category rules");
  return res.json();
}

export async function importCategoryRules(file: File): Promise<{ added: number }> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${BASE_URL}/import`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error("Failed to import category rules");
  return res.json();
}

export const EXPORT_RULES_URL = `${BASE_URL}/export`;