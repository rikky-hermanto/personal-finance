const BASE_URL = "https://localhost:7208/api/CategoryRules";

export interface CategoryRuleDto {
  type: string;
  keyword: string;
  id: string;
  pattern: string;
  category: string;
}

export async function getCategoryRules(): Promise<CategoryRuleDto[]> {
  const res = await fetch(BASE_URL);
  if (!res.ok) throw new Error("Failed to fetch category rules");
  return res.json();
}

export async function addCategoryRule(rule: Omit<CategoryRuleDto, "id">): Promise<CategoryRuleDto> {
  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(rule),
  });
  if (!res.ok) throw new Error("Failed to add category rule");
  return res.json();
}

export async function updateCategoryRule(id: string, rule: CategoryRuleDto): Promise<CategoryRuleDto> {
  const res = await fetch(`${BASE_URL}/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(rule),
  });
  if (!res.ok) throw new Error("Failed to update category rule");
  return res.json();
}

export async function deleteCategoryRule(id: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete category rule");
}