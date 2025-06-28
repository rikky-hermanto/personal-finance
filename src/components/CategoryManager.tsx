import { useState, useEffect } from 'react';
import { CategoryRule } from '@/types/Transaction';
import { Plus, Edit2, Trash2, Save, X } from 'lucide-react';
import {
  getCategoryRules,
  addCategoryRule,
  updateCategoryRule,
  deleteCategoryRule,
} from '@/api/categoryRulesApi';

interface CategoryManagerProps {
   categoryRules: CategoryRule[];
   onRuleUpdate: (rules: CategoryRule[]) => void;
}

const CategoryManager = () => {
  const [categoryRules, setCategoryRules] = useState<CategoryRule[]>([]);
  const [editingRule, setEditingRule] = useState<CategoryRule | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newRule, setNewRule] = useState<Omit<CategoryRule, 'id'>>({
    keyword: '',
    category: '',
    type: 'expense'
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getCategoryRules()
      .then((dtos) => {
        console.log("Fetched category rules:", dtos);
        setCategoryRules(
          dtos.map((dto) => ({
            ...dto,
            keyword: dto.keyword ?? '',
            category: dto.category ?? '',
            type: (dto.type ?? 'expense').toLowerCase() as 'income' | 'expense',
          }))
        );
      })
      .catch((err) => {
        console.error("Failed to fetch category rules", err);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSaveRule = async (rule: CategoryRule) => {
    // Ensure 'pattern' is included; fallback to empty string if not present
    const ruleDto = {
      type: rule.type,
      keyword: rule.keyword,
      id: rule.id,
      pattern: rule.keyword,
      category: rule.category,
    };
    const updated = await updateCategoryRule(rule.id, ruleDto);
    // Ensure the updated object matches CategoryRule type
    const normalized: CategoryRule = {
      ...updated,
      keyword: updated.keyword ?? '',
      category: updated.category ?? '',
      type: (updated.type ?? 'expense') as 'income' | 'expense',
    };
    setCategoryRules(rules => rules.map(r => r.id === rule.id ? normalized : r));
    setEditingRule(null);
  };

  const handleDeleteRule = async (id: string) => {
    await deleteCategoryRule(id);
    setCategoryRules(rules => rules.filter(r => r.id !== id));
  };

  const handleAddRule = async () => {
    if (newRule.keyword && newRule.category) {
      const created = await addCategoryRule({
        ...newRule,
        pattern: newRule.keyword, // or set as needed
      });
      const normalized: CategoryRule = {
        ...created,
        keyword: created.keyword ?? '',
        category: created.category ?? '',
        type: (created.type ?? 'expense') as 'income' | 'expense',
      };
      setCategoryRules(rules => [...rules, normalized]);
      setNewRule({ keyword: '', category: '', type: 'expense' });
      setIsAddingNew(false);
    }
  };

  const predefinedCategories = [
    'Food & Dining',
    'Groceries',
    'Shopping',
    'Entertainment',
    'Transportation',
    'Bills & Utilities',
    'Healthcare',
    'Investment Income',
    'Salary',
    'Transfer In',
    'Transfer Out',
    'Cash Withdrawal',
    'Bank Fees',
    'Charity',
    'Other'
  ];

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold text-gray-900">Category Management</h2>
        <button
          onClick={() => setIsAddingNew(true)}
          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Rule
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Categorization Rules</h3>
          <p className="text-sm text-gray-600 mt-1">
            Define keywords to automatically categorize transactions
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Keyword
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                   <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Category
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {categoryRules.map((rule) => (
                <tr key={rule.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    {editingRule?.id === rule.id ? (
                      <input
                        type="text"
                        value={editingRule.keyword}
                        onChange={(e) => setEditingRule({ ...editingRule, keyword: e.target.value })}
                        className="w-full px-3 py-1 border border-gray-300 rounded-md text-sm"
                      />
                    ) : (
                      <span className="text-sm font-medium text-gray-900">{rule.keyword}</span>
                    )}
                  </td>
              
                  <td className="px-6 py-4 whitespace-nowrap">
                    {editingRule?.id === rule.id ? (
                      <select
                        value={editingRule.type}
                        onChange={(e) => setEditingRule({ ...editingRule, type: e.target.value as 'income' | 'expense' })}
                        className="w-full px-3 py-1 border border-gray-300 rounded-md text-sm"
                      >
                        <option value="income">Income</option>
                        <option value="expense">Expense</option>
                      </select>
                    ) : (
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        rule.type === 'income' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {rule.type}
                      </span>
                    )}
                  </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                    {editingRule?.id === rule.id ? (
                      <select
                        value={editingRule.category}
                        onChange={(e) => setEditingRule({ ...editingRule, category: e.target.value })}
                        className="w-full px-3 py-1 border border-gray-300 rounded-md text-sm"
                      >
                        {predefinedCategories.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {rule.category}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    {editingRule?.id === rule.id ? (
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleSaveRule(editingRule)}
                          className="text-green-600 hover:text-green-900"
                        >
                          <Save className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setEditingRule(null)}
                          className="text-gray-600 hover:text-gray-900"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex space-x-2">
                        <button
                          onClick={() => setEditingRule(rule)}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteRule(rule.id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              
              {isAddingNew && (
                <tr className="bg-yellow-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <input
                      type="text"
                      placeholder="Enter keyword..."
                      value={newRule.keyword}
                      onChange={(e) => setNewRule({ ...newRule, keyword: e.target.value })}
                      className="w-full px-3 py-1 border border-gray-300 rounded-md text-sm"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <select
                      value={newRule.category}
                      onChange={(e) => setNewRule({ ...newRule, category: e.target.value })}
                      className="w-full px-3 py-1 border border-gray-300 rounded-md text-sm"
                    >
                      <option value="">Select category...</option>
                      {predefinedCategories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <select
                      value={newRule.type}
                      onChange={(e) => setNewRule({ ...newRule, type: e.target.value as 'income' | 'expense' })}
                      className="w-full px-3 py-1 border border-gray-300 rounded-md text-sm"
                    >
                      <option value="expense">Expense</option>
                      <option value="income">Income</option>
                    </select>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex space-x-2">
                      <button
                        onClick={handleAddRule}
                        className="text-green-600 hover:text-green-900"
                      >
                        <Save className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          setIsAddingNew(false);
                          setNewRule({ keyword: '', category: '', type: 'expense' });
                        }}
                        className="text-gray-600 hover:text-gray-900"
                      >
                        <X className="w-4 h-4" />
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
