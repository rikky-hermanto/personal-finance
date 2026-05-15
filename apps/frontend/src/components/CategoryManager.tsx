import { useState, useEffect, useRef, useMemo } from 'react';
import { CategoryRule } from '@/types/Transaction';
import { Plus, Edit2, Trash2, Save, X, Upload, Download, AlignJustify, Layers, FolderPlus } from 'lucide-react';
import CategoryGroupView from '@/components/CategoryGroupView';
import {
  getCategoryRules,
  addCategoryRule,
  updateCategoryRule,
  deleteCategoryRule,
  resetAllCategoryRules,
  importCategoryRules,
  EXPORT_RULES_URL
} from '@/api/categoryRulesApi';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

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
  const [viewMode, setViewMode] = useState<'keyword' | 'category'>('keyword');
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const { toast } = useToast();
  const [resetOpen, setResetOpen] = useState(false);
  const [resetPhrase, setResetPhrase] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchRules = () => {
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
  };

  useEffect(() => {
    fetchRules();
  }, []);

  const handleExport = () => {
    window.open(EXPORT_RULES_URL, '_blank');
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const res = await importCategoryRules(file);
      toast({ title: 'Rules imported', description: `Successfully imported ${res.added} rules.` });
      fetchRules();
    } catch (err) {
      toast({ title: 'Import failed', description: 'Could not import rules.', variant: 'destructive' });
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleReset = async () => {
    setIsResetting(true);
    try {
      await resetAllCategoryRules();
      setCategoryRules([]);
      toast({ title: 'Rules deleted', description: 'All category rules have been deleted.' });
      setResetOpen(false);
      setResetPhrase('');
    } catch (err) {
      toast({ title: 'Reset failed', description: 'Could not reset rules.', variant: 'destructive' });
    } finally {
      setIsResetting(false);
    }
  };

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

  const handleAddRule = async (rule?: Omit<CategoryRule, 'id'>) => {
    const target = rule ?? newRule;
    if (!target.keyword || !target.category) return;
    const created = await addCategoryRule({ keyword: target.keyword, category: target.category, type: target.type });
    setCategoryRules((rules) => [
      ...rules,
      { id: created.id, keyword: created.keyword ?? '', category: created.category ?? '', type: (created.type?.toLowerCase() ?? 'expense') as 'income' | 'expense', keywordLength: created.keywordLength },
    ]);
    if (!rule) {
      setNewRule({ keyword: '', category: '', type: 'expense' });
      setIsAddingNew(false);
    }
  };

  const handleRenameCategory = async (oldName: string, newName: string) => {
    const targets = categoryRules.filter(r => r.category === oldName);
    await Promise.all(
      targets.map(r => updateCategoryRule(r.id as number, { keyword: r.keyword, category: newName, type: r.type }))
    );
    setCategoryRules(prev => prev.map(r => r.category === oldName ? { ...r, category: newName } : r));
    toast({ title: 'Category renamed', description: `"${oldName}" → "${newName}"` });
  };

  const handleDeleteCategory = async (categoryName: string) => {
    const targets = categoryRules.filter(r => r.category === categoryName);
    await Promise.all(targets.map(r => deleteCategoryRule(r.id as number)));
    setCategoryRules(prev => prev.filter(r => r.category !== categoryName));
    toast({ title: 'Category deleted', description: `Deleted "${categoryName}" and ${targets.length} ${targets.length === 1 ? 'rule' : 'rules'}.` });
  };

  const sortedRules = useMemo(() =>
    [...categoryRules].sort((a, b) => {
      const lenDiff = b.keyword.length - a.keyword.length;
      if (lenDiff !== 0) return lenDiff;
      return a.keyword.localeCompare(b.keyword, undefined, { numeric: true, sensitivity: 'base' });
    }),
    [categoryRules]
  );

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <p className="text-xs text-muted-foreground mt-0.5">
            {categoryRules.length} rules
          </p>
          {/* View mode toggle */}
          <div className="flex items-center rounded-md border border-border overflow-hidden">
            <button
              onClick={() => setViewMode('keyword')}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 text-xs transition-colors',
                viewMode === 'keyword'
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
              )}
              title="By keyword"
            >
              <AlignJustify className="w-3 h-3" strokeWidth={1.5} />
              Keywords
            </button>
            <div className="w-px h-full bg-border" />
            <button
              onClick={() => setViewMode('category')}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 text-xs transition-colors',
                viewMode === 'category'
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
              )}
              title="By category"
            >
              <Layers className="w-3 h-3" strokeWidth={1.5} />
              Categories
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="file"
            accept=".csv"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileChange}
          />
          <button
            onClick={handleImportClick}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground border border-border rounded-md hover:bg-accent transition-colors"
            title="Import from CSV"
          >
            <Upload className="w-3.5 h-3.5" strokeWidth={1.5} />
            Import
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground border border-border rounded-md hover:bg-accent transition-colors"
            title="Export as CSV template"
          >
            <Download className="w-3.5 h-3.5" strokeWidth={1.5} />
            Export
          </button>
          {viewMode === 'keyword' && (
            <button
              onClick={() => setIsAddingNew(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground border border-border rounded-md hover:bg-accent transition-colors"
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
              Add Rule
            </button>
          )}
          {viewMode === 'category' && (
            <button
              onClick={() => setIsAddingCategory(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground border border-border rounded-md hover:bg-accent transition-colors"
            >
              <FolderPlus className="w-3.5 h-3.5" strokeWidth={1.5} />
              Add Category
            </button>
          )}
        </div>
      </div>

      {/* Category-focused view */}
      {viewMode === 'category' && (
        <CategoryGroupView
          rules={categoryRules}
          onSaveRule={handleSaveRule}
          onDeleteRule={handleDeleteRule}
          onAddRule={handleAddRule}
          onRenameCategory={handleRenameCategory}
          onDeleteCategory={handleDeleteCategory}
          isAddingCategory={isAddingCategory}
          onCancelAddCategory={() => setIsAddingCategory(false)}
        />
      )}

      {/* Keyword-focused table */}
      {viewMode === 'keyword' && <div className="bg-card rounded-lg border border-border overflow-hidden">
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
              {sortedRules.map((rule) => {
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
      </div>}

      <div className="pt-6">
        <div className="rounded-lg border border-destructive/50 bg-destructive/5">
          <div className="px-5 py-4 border-b border-destructive/20">
            <span className="text-xs font-semibold uppercase tracking-wider text-destructive">
              Danger Zone
            </span>
          </div>
          <div className="px-5 py-5 flex items-center justify-between gap-6">
            <div>
              <p className="text-sm font-medium text-foreground">Reset all rules</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Permanently delete all {categoryRules.length > 0 ? `${categoryRules.length.toLocaleString()} ` : ''}category rules.
              </p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              className="shrink-0"
              onClick={() => setResetOpen(true)}
            >
              Reset rules
            </Button>
          </div>
        </div>
      </div>

      <AlertDialog open={resetOpen} onOpenChange={(open) => {
        if (!open) setResetPhrase('');
        setResetOpen(open);
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset all category rules?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  This will permanently delete{' '}
                  <span className="font-semibold text-foreground">
                    {categoryRules.length.toLocaleString()} rule{categoryRules.length !== 1 ? 's' : ''}
                  </span>
                  .{' '}
                  <span className="font-medium text-foreground">This cannot be undone.</span>
                </p>
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">
                    Type <span className="font-mono font-medium text-foreground">delete all</span> to
                    confirm:
                  </p>
                  <Input
                    value={resetPhrase}
                    onChange={(e) => setResetPhrase(e.target.value)}
                    placeholder="delete all"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isResetting}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={resetPhrase.trim().toLowerCase() !== 'delete all' || isResetting}
              onClick={handleReset}
            >
              {isResetting ? 'Deleting…' : 'I understand, delete everything'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default CategoryManager;
