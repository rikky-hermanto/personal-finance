
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
        return <FileUpload onFileUpload={handleFileUpload} />;
      case 'transactions':
        return (
          <TransactionTable 
            transactions={transactions} 
            onTransactionUpdate={handleTransactionUpdate}
          />
        );
      case 'categories':
        return (
          <CategoryManager 
            categoryRules={categoryRules}
            onRuleUpdate={handleCategoryRulesUpdate}
          />
        );
      case 'settings':
        return (
          <div className="max-w-4xl mx-auto p-8">
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
                <p className="text-gray-500 text-sm mt-1">Manage your preferences and configuration</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 p-8">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Application Settings</h3>
                <p className="text-gray-500">Settings panel coming soon...</p>
              </div>
            </div>
          </div>
        );
      default:
        return <CashFlowDashboard transactions={transactions} />;
    }
  };

  return (
    <div className="flex h-screen bg-gray-25 w-full">
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
