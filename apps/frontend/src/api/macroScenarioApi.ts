import { SavedMacroScenario } from '@/types/MacroScenario';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:7208';
const BASE_URL = `${API_BASE_URL}/api/macro-scenarios`;

async function toJson<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

export const getMacroScenarios = (): Promise<SavedMacroScenario[]> =>
  fetch(BASE_URL).then(toJson<SavedMacroScenario[]>);

export const createMacroScenario = (name: string, driversJson: string): Promise<SavedMacroScenario> =>
  fetch(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, driversJson }),
  }).then(toJson<SavedMacroScenario>);

export const deleteMacroScenario = (id: string): Promise<void> =>
  fetch(`${BASE_URL}/${id}`, { method: 'DELETE' }).then((r) => {
    if (!r.ok) throw new Error(`Request failed: ${r.status}`);
  });
