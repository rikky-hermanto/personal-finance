
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
    // Simulate file processing - in real app, this would parse actual files
    console.log('Files uploaded:', files.map(f => f.name));
    
    // Show success message or update UI
    // For now, we're using mock data that's already loaded
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
    // In a real app, you'd re-categorize transactions based on new rules
  }, []);

  const handleCategoryDrillDown = useCallback((category: string, month: string) => {
    setDrillDownData({ category, month });
  }, []);

  const handleBackToDashboard = useCallback(() => {
    setDrillDownData(null);
  }, []);

  const renderContent = () => {
    // If we're in drill-down mode, show the drill-down view
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
          <div className="max-w-2xl mx-auto p-6">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Settings</h2>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Application Settings</h3>
              <p className="text-gray-600">Settings panel coming soon...</p>
            </div>
          </div>
        );
      default:
        return <CashFlowDashboard transactions={transactions} />;
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar activeView={activeView} onViewChange={(view) => {
        setActiveView(view);
        setDrillDownData(null); // Clear drill-down when switching views
      }} />
      <main className="flex-1 overflow-auto">
        <div className="p-6">
          {renderContent()}
        </div>
      </main>
    </div>
  );
};

export default Index;
