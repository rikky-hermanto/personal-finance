import { useState, useEffect } from 'react';
import { CategoryRule } from '@/types/Transaction';
import { ChevronDown, ChevronRight, Plus, Edit2, Trash2, Save, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const CATEGORY_COLORS: Record<string, string> = {
  'Food & Dining':    'bg-orange-500',
  'Groceries':        'bg-lime-500',
  'Shopping':         'bg-purple-500',
  'Entertainment':    'bg-pink-500',
  'Transportation':   'bg-blue-500',
  'Bills & Utilities':'bg-yellow-500',
  'Healthcare':       'bg-red-500',
  'Investment Income':'bg-emerald-500',
  'Salary':           'bg-teal-500',
  'Transfer In':      'bg-cyan-500',
  'Transfer Out':     'bg-indigo-500',
  'Cash Withdrawal':  'bg-gray-500',
  'Bank Fees':        'bg-rose-500',
  'Charity':          'bg-violet-500',
  'Other':            'bg-slate-500',
};

const inputCls =
  'px-2 py-1 bg-muted border border-border rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring';

interface Props {
  rules: CategoryRule[];
  onSaveRule: (rule: CategoryRule) => Promise<void>;
  onDeleteRule: (id: number | string) => Promise<void>;
  onAddRule: (rule: Omit<CategoryRule, 'id'>) => Promise<void>;
  onRenameCategory: (oldName: string, newName: string) => Promise<void>;
  onDeleteCategory: (categoryName: string) => Promise<void>;
  isAddingCategory?: boolean;
  onCancelAddCategory?: () => void;
}

const CategoryGroupView = ({
  rules,
  onSaveRule,
  onDeleteRule,
  onAddRule,
  onRenameCategory,
  onDeleteCategory,
  isAddingCategory = false,
  onCancelAddCategory,
}: Props) => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingRule, setEditingRule] = useState<CategoryRule | null>(null);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [newKeyword, setNewKeyword] = useState('');
  const [newType, setNewType] = useState<'income' | 'expense'>('expense');

  // Category-level management
  const [renamingCategory, setRenamingCategory] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDeleteCat, setConfirmDeleteCat] = useState<string | null>(null);

  // New category form
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryKeyword, setNewCategoryKeyword] = useState('');
  const [newCategoryType, setNewCategoryType] = useState<'income' | 'expense'>('expense');

  // Reset new category form when panel closes
  useEffect(() => {
    if (!isAddingCategory) {
      setNewCategoryName('');
      setNewCategoryKeyword('');
      setNewCategoryType('expense');
    }
  }, [isAddingCategory]);

  const groups = Object.entries(
    rules.reduce<Record<string, CategoryRule[]>>((acc, rule) => {
      const key = rule.category || 'Uncategorized';
      (acc[key] ??= []).push(rule);
      return acc;
    }, {})
  )
    .map(([category, catRules]) => ({ category, rules: catRules }))
    .sort((a, b) => b.rules.length - a.rules.length);

  const toggle = (category: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(category) ? next.delete(category) : next.add(category);
      return next;
    });

  const startAdding = (category: string) => {
    setExpanded(prev => new Set([...prev, category]));
    setAddingTo(category);
    setNewKeyword('');
    setNewType('expense');
  };

  const confirmAdd = async (category: string) => {
    if (!newKeyword.trim()) return;
    await onAddRule({ keyword: newKeyword.trim(), category, type: newType });
    setNewKeyword('');
    setAddingTo(null);
  };

  const startRenaming = (category: string) => {
    setRenamingCategory(category);
    setRenameValue(category);
  };

  const confirmRename = async (oldName: string) => {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === oldName) {
      setRenamingCategory(null);
      return;
    }
    await onRenameCategory(oldName, trimmed);
    setRenamingCategory(null);
  };

  const handleDeleteCategory = async (category: string) => {
    await onDeleteCategory(category);
    setConfirmDeleteCat(null);
  };

  const handleAddNewCategory = async () => {
    if (!newCategoryName.trim() || !newCategoryKeyword.trim()) return;
    await onAddRule({
      keyword: newCategoryKeyword.trim(),
      category: newCategoryName.trim(),
      type: newCategoryType,
    });
    setNewCategoryName('');
    setNewCategoryKeyword('');
    setNewCategoryType('expense');
    onCancelAddCategory?.();
  };

  return (
    <div className="space-y-2">

      {/* ── New category form ── */}
      {isAddingCategory && (
        <div className="bg-card rounded-lg border border-dashed border-border overflow-hidden">
          <div className="px-5 py-3.5 flex items-center gap-3 bg-muted/30">
            <div className="w-2 h-2 rounded-full bg-slate-400 shrink-0" />
            <input
              type="text"
              placeholder="Category name"
              value={newCategoryName}
              onChange={e => setNewCategoryName(e.target.value)}
              className={cn(inputCls, 'w-44 shrink-0')}
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleAddNewCategory()}
            />
            <span className="text-xs text-muted-foreground shrink-0">—</span>
            <input
              type="text"
              placeholder="First keyword"
              value={newCategoryKeyword}
              onChange={e => setNewCategoryKeyword(e.target.value)}
              className={cn(inputCls, 'flex-1 font-mono text-xs')}
              onKeyDown={e => e.key === 'Enter' && handleAddNewCategory()}
            />
            <select
              value={newCategoryType}
              onChange={e => setNewCategoryType(e.target.value as 'income' | 'expense')}
              className={cn(inputCls, 'w-24 shrink-0')}
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
            <button
              onClick={handleAddNewCategory}
              className="text-success hover:text-foreground transition-colors shrink-0"
              title="Create category"
            >
              <Save className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
            <button
              onClick={() => onCancelAddCategory?.()}
              className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
              title="Cancel"
            >
              <X className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          </div>
        </div>
      )}

      {groups.map(({ category, rules: catRules }) => {
        const isExpanded = expanded.has(category);
        const color = CATEGORY_COLORS[category] ?? 'bg-slate-500';
        const preview = catRules.slice(0, 4);
        const overflow = catRules.length - preview.length;

        const incomeCount = catRules.filter(r => r.type === 'income').length;
        const dominantType = incomeCount > catRules.length / 2 ? 'income' : 'expense';

        const isRenaming = renamingCategory === category;
        const isConfirmingDelete = confirmDeleteCat === category;

        return (
          <div key={category} className="bg-card rounded-lg border border-border overflow-hidden">

            {/* ── Category header row ── */}
            <div
              className="group w-full px-5 py-3.5 flex items-center gap-3 hover:bg-accent transition-colors cursor-pointer"
              onClick={() => !isRenaming && toggle(category)}
            >
              {/* Color dot */}
              <div className={cn('w-2 h-2 rounded-full shrink-0', color)} />

              {/* Name or rename input */}
              {isRenaming ? (
                <input
                  type="text"
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onClick={e => e.stopPropagation()}
                  onKeyDown={e => {
                    e.stopPropagation();
                    if (e.key === 'Enter') confirmRename(category);
                    if (e.key === 'Escape') setRenamingCategory(null);
                  }}
                  className={cn(inputCls, 'w-44 shrink-0')}
                  autoFocus
                />
              ) : (
                <span className="text-sm font-medium text-foreground w-40 shrink-0 truncate">{category}</span>
              )}

              {/* Keyword preview tags */}
              {!isExpanded && !isRenaming && (
                <div className="flex items-center gap-1.5 flex-1 flex-wrap overflow-hidden">
                  {preview.map(r => (
                    <span
                      key={r.id}
                      className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-secondary text-secondary-foreground truncate max-w-[150px]"
                    >
                      {r.keyword}
                    </span>
                  ))}
                  {overflow > 0 && (
                    <span className="text-[10px] text-muted-foreground">{overflow}+</span>
                  )}
                </div>
              )}
              {(isExpanded || isRenaming) && <span className="flex-1" />}

              {/* Right side: rule count (normal) ↔ actions (hover) ↔ save/cancel (renaming) */}
              {isRenaming ? (
                <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => confirmRename(category)}
                    className="p-1 text-success hover:text-foreground transition-colors"
                    title="Save"
                  >
                    <Save className="w-3.5 h-3.5" strokeWidth={1.5} />
                  </button>
                  <button
                    onClick={() => setRenamingCategory(null)}
                    className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                    title="Cancel"
                  >
                    <X className="w-3.5 h-3.5" strokeWidth={1.5} />
                  </button>
                </div>
              ) : (
                <>
                  {/* Rule count — hidden on hover, replaced by action buttons */}
                  <span className="text-xs text-muted-foreground tabular-nums shrink-0 group-hover:hidden">
                    {catRules.length} {catRules.length === 1 ? 'rule' : 'rules'}
                  </span>

                  {/* Hover actions */}
                  <div
                    className="hidden group-hover:flex items-center gap-0.5 shrink-0"
                    onClick={e => e.stopPropagation()}
                  >
                    <button
                      onClick={() => startRenaming(category)}
                      className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                      title="Rename category"
                    >
                      <Edit2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </button>
                    <button
                      onClick={() => setConfirmDeleteCat(isConfirmingDelete ? null : category)}
                      className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                      title="Delete category"
                    >
                      <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </button>
                  </div>

                  {/* Dominant type badge */}
                  <span className={cn(
                    'text-[10px] font-medium uppercase tracking-wide shrink-0 w-12 text-right',
                    dominantType === 'income' ? 'text-success' : 'text-destructive'
                  )}>
                    {dominantType}
                  </span>

                  {/* Chevron */}
                  {isExpanded
                    ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" strokeWidth={1.5} />
                    : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" strokeWidth={1.5} />}
                </>
              )}
            </div>

            {/* ── Delete category confirmation bar ── */}
            {isConfirmingDelete && (
              <div className="px-5 py-2.5 flex items-center justify-between gap-3 border-t border-destructive/30 bg-destructive/5">
                <p className="text-xs text-foreground">
                  Delete <span className="font-medium">{category}</span> and all{' '}
                  <span className="font-medium">{catRules.length}</span>{' '}
                  {catRules.length === 1 ? 'rule' : 'rules'}?
                </p>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleDeleteCategory(category)}
                    className="px-2.5 py-1 text-xs font-medium rounded bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => setConfirmDeleteCat(null)}
                    className="px-2.5 py-1 text-xs font-medium rounded border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* ── Expanded keyword list ── */}
            {isExpanded && (
              <div className="border-t border-border">
                {/* Column headers */}
                <div className="px-5 py-1.5 grid grid-cols-[1fr_5rem_4rem] gap-3 border-b border-border/50">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Keyword</span>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Type</span>
                  <span />
                </div>

                <div className="divide-y divide-border">
                  {catRules.map(rule => {
                    const isEditing = editingRule?.id === rule.id;
                    return (
                      <div
                        key={String(rule.id)}
                        className="px-5 py-2 grid grid-cols-[1fr_5rem_4rem] gap-3 items-center hover:bg-accent/40 transition-colors"
                      >
                        {isEditing ? (
                          <>
                            <input
                              type="text"
                              value={editingRule.keyword}
                              onChange={e => setEditingRule({ ...editingRule, keyword: e.target.value })}
                              className={cn(inputCls, 'w-full')}
                              autoFocus
                            />
                            <select
                              value={editingRule.type}
                              onChange={e => setEditingRule({ ...editingRule, type: e.target.value as 'income' | 'expense' })}
                              className={cn(inputCls, 'w-full')}
                            >
                              <option value="expense">Expense</option>
                              <option value="income">Income</option>
                            </select>
                            <div className="flex items-center gap-2 justify-end">
                              <button
                                onClick={async () => { await onSaveRule(editingRule); setEditingRule(null); }}
                                className="text-success hover:text-foreground transition-colors"
                              >
                                <Save className="w-3.5 h-3.5" strokeWidth={1.5} />
                              </button>
                              <button onClick={() => setEditingRule(null)} className="text-muted-foreground hover:text-foreground transition-colors">
                                <X className="w-3.5 h-3.5" strokeWidth={1.5} />
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            <span className="font-mono text-xs text-foreground truncate">{rule.keyword}</span>
                            <span className={cn(
                              'text-xs',
                              rule.type === 'income' ? 'text-success' : 'text-muted-foreground'
                            )}>
                              {rule.type}
                            </span>
                            <div className="flex items-center gap-2 justify-end">
                              <button onClick={() => setEditingRule(rule)} className="text-muted-foreground hover:text-foreground transition-colors">
                                <Edit2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                              </button>
                              <button onClick={() => onDeleteRule(rule.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                                <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Add keyword row */}
                {addingTo === category ? (
                  <div className="px-5 py-2.5 flex items-center gap-3 border-t border-border bg-muted/40">
                    <input
                      type="text"
                      placeholder="NEW KEYWORD"
                      value={newKeyword}
                      onChange={e => setNewKeyword(e.target.value)}
                      className={cn(inputCls, 'flex-1 font-mono text-xs')}
                      autoFocus
                      onKeyDown={e => e.key === 'Enter' && confirmAdd(category)}
                    />
                    <select
                      value={newType}
                      onChange={e => setNewType(e.target.value as 'income' | 'expense')}
                      className={cn(inputCls, 'w-28 shrink-0')}
                    >
                      <option value="expense">Expense</option>
                      <option value="income">Income</option>
                    </select>
                    <button onClick={() => confirmAdd(category)} className="text-success hover:text-foreground transition-colors shrink-0">
                      <Save className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </button>
                    <button onClick={() => { setAddingTo(null); setNewKeyword(''); }} className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
                      <X className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </button>
                  </div>
                ) : (
                  <div className="px-5 py-2 border-t border-border/50">
                    <button
                      onClick={() => startAdding(category)}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Plus className="w-3 h-3" strokeWidth={1.5} />
                      Add keyword to {category}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default CategoryGroupView;
