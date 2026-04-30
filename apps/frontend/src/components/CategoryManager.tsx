import { useState, useEffect } from 'react';
import { CategoryRule } from '@/types/Transaction';
import { Plus, Edit2, Trash2, Save, X } from 'lucide-react';
import {
  getCategoryRules,
  addCategoryRule,
  updateCategoryRule,
  deleteCategoryRule,
} from '@/api/categoryRulesApi';
import { cn } from '@/lib/utils';

const predefinedCategories = [
  'Food & Dining', 'Groceries', 'Shopping', 'Entertainment', 'Transportation',
  'Bills & Utilities', 'Healthcare', 'Investment Income', 'Salary',
  'Transfer In', 'Transfer Out', 'Cash Withdrawal', 'Bank Fees', 'Charity', 'Other',
];

const inputCls = 'w-full px-2 py-1 bg-muted border border-border rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring';

const CategoryManager = () => {
  const [categoryRules, setCategoryRules] = useState<CategoryRule[]>([]);
  const [editingRule, setEditingRule] = useState<CategoryRule | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newRule, setNewRule] = useState<Omit<CategoryRule, 'id'>>({ keyword: '', category: '', type: 'expense' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getCategoryRules()
      .then((dtos) => {
        setCategoryRules(
          dtos.map((dto) => ({
            id: dto.id,
            keyword: dto.keyword ?? '',
            category: dto.category ?? '',
            type: (dto.type?.toLowerCase() ?? 'expense') as 'income' | 'expense',
            keywordLength: dto.keywordLength,
          }))
        );
      })
      .catch((err) => console.error('Failed to fetch category rules', err))
      .finally(() => setLoading(false));
  }, []);

  const handleSaveRule = async (rule: CategoryRule) => {
    const updated = await updateCategoryRule(rule.id as number, { keyword: rule.keyword, category: rule.category, type: rule.type });
    setCategoryRules((rules) =>
      rules.map((r) =>
        r.id === rule.id
          ? { id: updated.id, keyword: updated.keyword ?? '', category: updated.category ?? '', type: (updated.type?.toLowerCase() ?? 'expense') as 'income' | 'expense', keywordLength: updated.keywordLength }
          : r
      )
    );
    setEditingRule(null);
  };

  const handleDeleteRule = async (id: number | string) => {
    await deleteCategoryRule(id as number);
    setCategoryRules((rules) => rules.filter((r) => r.id !== id));
  };

  const handleAddRule = async () => {
    if (!newRule.keyword || !newRule.category) return;
    const created = await addCategoryRule({ keyword: newRule.keyword, category: newRule.category, type: newRule.type });
    setCategoryRules((rules) => [
      ...rules,
      { id: created.id, keyword: created.keyword ?? '', category: created.category ?? '', type: (created.type?.toLowerCase() ?? 'expense') as 'income' | 'expense', keywordLength: created.keywordLength },
    ]);
    setNewRule({ keyword: '', category: '', type: 'expense' });
    setIsAddingNew(false);
  };

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {categoryRules.length} rules — longest-keyword match applies first
          </p>
        </div>
        <button
          onClick={() => setIsAddingNew(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground border border-border rounded-md hover:bg-accent transition-colors"
        >
          <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
          Add Rule
        </button>
      </div>

      {/* Table card */}
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                {['Keyword', 'Type', 'Category', ''].map((h) => (
                  <th
                    key={h}
                    className="px-5 py-3 text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {categoryRules.map((rule) => {
                const isEditing = editingRule?.id === rule.id;
                return (
                  <tr key={String(rule.id)} className="hover:bg-accent transition-colors">
                    {/* Keyword */}
                    <td className="px-5 py-3 whitespace-nowrap">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editingRule.keyword}
                          onChange={(e) => setEditingRule({ ...editingRule, keyword: e.target.value })}
                          className={inputCls}
                        />
                      ) : (
                        <span className="font-mono text-xs text-foreground">{rule.keyword}</span>
                      )}
                    </td>

                    {/* Type */}
                    <td className="px-5 py-3 whitespace-nowrap">
                      {isEditing ? (
                        <select
                          value={editingRule.type}
                          onChange={(e) => setEditingRule({ ...editingRule, type: e.target.value as 'income' | 'expense' })}
                          className={inputCls}
                        >
                          <option value="income">Income</option>
                          <option value="expense">Expense</option>
                        </select>
                      ) : (
                        <span className={cn(
                          'text-xs font-medium',
                          rule.type === 'income' ? 'text-success' : 'text-destructive'
                        )}>
                          {rule.type}
                        </span>
                      )}
                    </td>

                    {/* Category */}
                    <td className="px-5 py-3 whitespace-nowrap">
                      {isEditing ? (
                        <select
                          value={editingRule.category}
                          onChange={(e) => setEditingRule({ ...editingRule, category: e.target.value })}
                          className={inputCls}
                        >
                          {predefinedCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-secondary text-secondary-foreground">
                          {rule.category}
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-3 whitespace-nowrap">
                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <button onClick={() => handleSaveRule(editingRule)} className="text-success hover:text-foreground transition-colors">
                            <Save className="w-3.5 h-3.5" strokeWidth={1.5} />
                          </button>
                          <button onClick={() => setEditingRule(null)} className="text-muted-foreground hover:text-foreground transition-colors">
                            <X className="w-3.5 h-3.5" strokeWidth={1.5} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button onClick={() => setEditingRule(rule)} className="text-muted-foreground hover:text-foreground transition-colors">
                            <Edit2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                          </button>
                          <button onClick={() => handleDeleteRule(rule.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                            <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}

              {/* New rule inline row */}
              {isAddingNew && (
                <tr className="bg-muted">
                  <td className="px-5 py-3">
                    <input
                      type="text"
                      placeholder="KEYWORD"
                      value={newRule.keyword}
                      onChange={(e) => setNewRule({ ...newRule, keyword: e.target.value })}
                      className={inputCls}
                      autoFocus
                    />
                  </td>
                  <td className="px-5 py-3">
                    <select
                      value={newRule.type}
                      onChange={(e) => setNewRule({ ...newRule, type: e.target.value as 'income' | 'expense' })}
                      className={inputCls}
                    >
                      <option value="expense">Expense</option>
                      <option value="income">Income</option>
                    </select>
                  </td>
                  <td className="px-5 py-3">
                    <select
                      value={newRule.category}
                      onChange={(e) => setNewRule({ ...newRule, category: e.target.value })}
                      className={inputCls}
                    >
                      <option value="">Select category…</option>
                      {predefinedCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={handleAddRule} className="text-success hover:text-foreground transition-colors">
                        <Save className="w-3.5 h-3.5" strokeWidth={1.5} />
                      </button>
                      <button onClick={() => { setIsAddingNew(false); setNewRule({ keyword: '', category: '', type: 'expense' }); }} className="text-muted-foreground hover:text-foreground transition-colors">
                        <X className="w-3.5 h-3.5" strokeWidth={1.5} />
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default CategoryManager;
