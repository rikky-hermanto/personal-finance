import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AppShell from "@/components/AppShell";
import ErrorBoundary from "@/components/ErrorBoundary";
import DashboardPage from "@/pages/DashboardPage";
import CashflowLayout from "@/pages/cashflow/CashflowLayout";
import OverviewTab from "@/pages/cashflow/OverviewTab";
import TransactionsTab from "@/pages/cashflow/TransactionsTab";
import UploadTab from "@/pages/cashflow/UploadTab";
import StatementTab from "@/pages/cashflow/StatementTab";
import AccountsTab from "@/pages/cashflow/AccountsTab";
import AnalysisTab from "@/pages/cashflow/AnalysisTab";
import SettingsLayout from "@/pages/settings/SettingsLayout";
import AppearanceTab from "@/pages/settings/AppearanceTab";
import CategoriesTab from "@/pages/settings/CategoriesTab";
import DataTab from "@/pages/settings/DataTab";
import RegionalTab from "@/pages/settings/RegionalTab";
import BanksTab from "@/pages/settings/BanksTab";
import NotFound from "@/pages/NotFound";
import StatusPage from "@/pages/StatusPage";
import AssetsLayout from '@/pages/assets/AssetsLayout';
import AssetsOverviewTab from '@/pages/assets/OverviewTab';
import AssetsAccountsTab from '@/pages/assets/AccountsTab';
import InvestmentsTab from '@/pages/assets/InvestmentsTab';
import PropertiesTab from '@/pages/assets/PropertiesTab';
import LiabilitiesTab from '@/pages/assets/LiabilitiesTab';
import InvestmentLayout from '@/pages/investment/InvestmentLayout';
import InvestmentHome from '@/pages/investment/InvestmentHome';
import InvestmentWizard from '@/pages/investment/InvestmentWizard';
import InvestmentSetupDetail from '@/pages/investment/InvestmentSetupDetail';
import InvestmentAnalysis from '@/pages/investment/InvestmentAnalysis';
import HoldingsTab from '@/pages/investment/HoldingsTab';
import SnapshotsTab from '@/pages/investment/SnapshotsTab';
import AIReviewTab from '@/pages/investment/AIReviewTab';

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider delayDuration={0}>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          {/* Legacy redirects — keep bookmarks working */}
          <Route path="/upload" element={<Navigate to="/cashflow/upload" replace />} />
          <Route path="/transactions" element={<Navigate to="/cashflow/transactions" replace />} />
          <Route path="/categories" element={<Navigate to="/settings/categories" replace />} />
          <Route element={<ErrorBoundary><AppShell /></ErrorBoundary>}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/cashflow" element={<CashflowLayout />}>
              <Route index element={<Navigate to="/cashflow/overview" replace />} />
              <Route path="overview" element={<OverviewTab />} />
              <Route path="transactions" element={<TransactionsTab />} />
              <Route path="upload" element={<UploadTab />} />
              <Route path="accounts" element={<AccountsTab />} />
              <Route path="statement" element={<StatementTab />} />
              <Route path="analysis" element={<AnalysisTab />} />
            </Route>
            <Route path="/settings" element={<SettingsLayout />}>
              <Route index element={<Navigate to="/settings/appearance" replace />} />
              <Route path="appearance" element={<AppearanceTab />} />
              <Route path="categories" element={<CategoriesTab />} />
              <Route path="regional" element={<RegionalTab />} />
              <Route path="data" element={<DataTab />} />
              <Route path="banks" element={<BanksTab />} />
            </Route>
            <Route path="/assets" element={<AssetsLayout />}>
              <Route index element={<Navigate to="/assets/overview" replace />} />
              <Route path="overview" element={<AssetsOverviewTab />} />
              <Route path="accounts" element={<AssetsAccountsTab />} />
              <Route path="investments" element={<InvestmentsTab />} />
              <Route path="properties" element={<PropertiesTab />} />
              <Route path="liabilities" element={<LiabilitiesTab />} />
            </Route>
            <Route path="/investment" element={<InvestmentLayout />}>
              <Route index element={<Navigate to="/investment/overview" replace />} />
              <Route path="overview" element={<InvestmentHome />} />
              <Route path="holdings" element={<HoldingsTab />} />
              <Route path="snapshots" element={<SnapshotsTab />} />
              <Route path="ai-review" element={<AIReviewTab />} />
              <Route path="new" element={<InvestmentWizard />} />
              <Route path=":setupId" element={<InvestmentSetupDetail />} />
              <Route path=":setupId/review/:snapshotId" element={<InvestmentAnalysis />} />
            </Route>
          </Route>
          <Route path="/status" element={<StatusPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
