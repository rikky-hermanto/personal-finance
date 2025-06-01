
import { useState, useCallback } from 'react';
import Sidebar from '@/components/Sidebar';
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
  const [drillDownData, setDrillDownData] = useState<{category: string; month: string} | null>(null);

  const handleFileUpload = useCallback((files: File[]) => {
    console.log('Files uploaded:', files.map(f => f.name));
  }, []);

  const handleTransactionUpdate = useCallback((id: string, updates: Partial<Transaction>) => {
    setTransactions(prev => 
      prev.map(transaction => 
        transaction.id === id ? { ...transaction, ...updates } : transaction
      )
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
          <div className="min-h-screen bg-background p-6">
            <div className="max-w-4xl mx-auto">
              <div className="mb-8">
                <h1 className="text-3xl font-semibold text-foreground">Upload Transactions</h1>
                <p className="text-muted-foreground mt-2">Import your bank statements and transaction files</p>
              </div>
              <FileUpload onFileUpload={handleFileUpload} />
            </div>
          </div>
        );
      case 'transactions':
        return (
          <div className="min-h-screen bg-background p-6">
            <div className="max-w-7xl mx-auto">
              <div className="mb-8">
                <h1 className="text-3xl font-semibold text-foreground">Transactions</h1>
                <p className="text-muted-foreground mt-2">View and manage all your transactions</p>
              </div>
              <TransactionTable 
                transactions={transactions} 
                onTransactionUpdate={handleTransactionUpdate}
              />
            </div>
          </div>
        );
      case 'categories':
        return (
          <div className="min-h-screen bg-background p-6">
            <div className="max-w-4xl mx-auto">
              <div className="mb-8">
                <h1 className="text-3xl font-semibold text-foreground">Categories</h1>
                <p className="text-muted-foreground mt-2">Manage transaction categories and rules</p>
              </div>
              <CategoryManager 
                categoryRules={categoryRules}
                onRuleUpdate={handleCategoryRulesUpdate}
              />
            </div>
          </div>
        );
      case 'settings':
        return (
          <div className="min-h-screen bg-background p-6">
            <div className="max-w-4xl mx-auto">
              <div className="mb-8">
                <h1 className="text-3xl font-semibold text-foreground">Settings</h1>
                <p className="text-muted-foreground mt-2">Manage your preferences and configuration</p>
              </div>
              <div className="bg-card border border-border rounded-2xl p-8">
                <h3 className="text-lg font-medium text-foreground mb-4">Application Settings</h3>
                <p className="text-muted-foreground">Settings panel coming soon...</p>
              </div>
            </div>
          </div>
        );
      default:
        return <CashFlowDashboard transactions={transactions} onCategoryDrillDown={handleCategoryDrillDown} />;
    }
  };

  return (
    <div className="flex h-screen bg-background w-full">
      <Sidebar activeView={activeView} onViewChange={(view) => {
        setActiveView(view);
        setDrillDownData(null);
      }} />
      <main className="flex-1 overflow-auto">
        {renderContent()}
      </main>
    </div>
  );
};

export default Index;
