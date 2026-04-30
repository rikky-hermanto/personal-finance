
import { useState, useCallback } from 'react';
import AppShell from '@/components/AppShell';
import FileUpload from '@/components/FileUpload';
import CashFlowDashboard from '@/components/CashFlowDashboard';
import TransactionTable from '@/components/TransactionTable';
import CategoryManager from '@/components/CategoryManager';
import DrillDownView from '@/components/DrillDownView';
import { mockTransactions, categoryRules as initialCategoryRules } from '@/data/mockTransactions';
import { Transaction, CategoryRule } from '@/types/Transaction';

const Index = () => {
  const [activeView, setActiveView] = useState('dashboard');
  const [transactions, setTransactions] = useState<Transaction[]>(mockTransactions);
  const [categoryRules, setCategoryRules] = useState<CategoryRule[]>(initialCategoryRules);
  const [drillDownData, setDrillDownData] = useState<{ category: string; month: string } | null>(null);

  const handleFileUpload = useCallback((files: File[]) => {
    console.log('Files uploaded:', files.map((f) => f.name));
  }, []);

  const handleTransactionUpdate = useCallback((id: string, updates: Partial<Transaction>) => {
    setTransactions((prev) =>
      prev.map((tx) => (tx.id === id ? { ...tx, ...updates } : tx))
    );
  }, []);

  const handleCategoryRulesUpdate = useCallback((rules: CategoryRule[]) => {
    setCategoryRules(rules);
  }, []);

  const handleCategoryDrillDown = useCallback((category: string, month: string) => {
    setDrillDownData({ category, month });
  }, []);

  const handleBackToDashboard = useCallback(() => {
    setDrillDownData(null);
  }, []);

  const handleViewChange = useCallback((view: string) => {
    setActiveView(view);
    setDrillDownData(null);
  }, []);

  const renderContent = () => {
    if (drillDownData && activeView === 'dashboard') {
      return (
        <DrillDownView
          transactions={transactions}
          category={drillDownData.category}
          month={drillDownData.month}
          onBack={handleBackToDashboard}
        />
      );
    }

    switch (activeView) {
      case 'dashboard':
        return (
          <CashFlowDashboard
            transactions={transactions}
            onCategoryDrillDown={handleCategoryDrillDown}
          />
        );
      case 'upload':
        return (
          <div className="p-8 bg-background min-h-full">
            <div className="max-w-6xl mx-auto">
              <div className="mb-6">
                <h1 className="text-xl font-semibold text-foreground">Upload Transactions</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Import your bank statements and transaction files
                </p>
              </div>
              <FileUpload onFileUpload={handleFileUpload} />
            </div>
          </div>
        );
      case 'transactions':
        return (
          <div className="p-8 bg-background min-h-full">
            <div className="max-w-6xl mx-auto">
              <div className="mb-6">
                <h1 className="text-xl font-semibold text-foreground">Transactions</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  View and manage all your transactions
                </p>
              </div>
              <TransactionTable onTransactionUpdate={handleTransactionUpdate} />
            </div>
          </div>
        );
      case 'categories':
        return (
          <div className="p-8 bg-background min-h-full">
            <div className="max-w-6xl mx-auto">
              <div className="mb-6">
                <h1 className="text-xl font-semibold text-foreground">Categories</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Keywords matched case-insensitively against transaction descriptions
                </p>
              </div>
              <CategoryManager />
            </div>
          </div>
        );
      case 'settings':
        return (
          <div className="p-8 bg-background min-h-full">
            <div className="max-w-6xl mx-auto">
              <div className="mb-6">
                <h1 className="text-xl font-semibold text-foreground">Settings</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Manage your preferences and configuration
                </p>
              </div>
              <div className="bg-card border border-border rounded-lg p-8">
                <h3 className="text-sm font-medium text-foreground mb-2">Application Settings</h3>
                <p className="text-xs text-muted-foreground">Settings panel coming soon…</p>
              </div>
            </div>
          </div>
        );
      default:
        return (
          <CashFlowDashboard
            transactions={transactions}
            onCategoryDrillDown={handleCategoryDrillDown}
          />
        );
    }
  };

  return (
    <AppShell
      activeView={activeView}
      onViewChange={handleViewChange}
      transactions={transactions}
    >
      {renderContent()}
    </AppShell>
  );
};

export default Index;
