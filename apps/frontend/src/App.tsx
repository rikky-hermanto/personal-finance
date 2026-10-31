import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import AppShell from '@/components/AppShell';
import ErrorBoundary from '@/components/ErrorBoundary';
import LoginPage from '@/pages/auth/LoginPage';
import { JourneyPage } from '@/pages/journey/JourneyPage';
import { AchievementsPage } from '@/pages/journey/AchievementsPage';
import CashflowLayout from '@/pages/cashflow/CashflowLayout';
import OverviewTab from '@/pages/cashflow/OverviewTab';
import TransactionsTab from '@/pages/cashflow/TransactionsTab';
import UploadTab from '@/pages/cashflow/UploadTab';
import StatementTab from '@/pages/cashflow/StatementTab';
import AccountsTab from '@/pages/cashflow/AccountsTab';
import AnalysisTab from '@/pages/cashflow/AnalysisTab';
import SettingsLayout from '@/pages/settings/SettingsLayout';
import AppearanceTab from '@/pages/settings/AppearanceTab';
import CategoriesTab from '@/pages/settings/CategoriesTab';
import DataTab from '@/pages/settings/DataTab';
import RegionalTab from '@/pages/settings/RegionalTab';
import NotFound from '@/pages/NotFound';
import StatusPage from '@/pages/StatusPage';
import ChatPage from '@/pages/ChatPage';
import { AI_CHAT_ENABLED } from '@/lib/featureFlags';
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
import DeskLayout from '@/pages/desk/DeskLayout';
import CommandTab from '@/pages/desk/CommandTab';
import PortfolioTab from '@/pages/desk/PortfolioTab';
import MandateTab from '@/pages/desk/MandateTab';
import ReconcileTab from '@/pages/desk/ReconcileTab';
import MacroLabPage from '@/pages/lab/MacroLabPage';

function RequireAuth() {
  const { session, loading } = useAuth();
  if (loading) return <main className="flex min-h-screen items-center justify-center text-muted-foreground">Loading your session…</main>;
  return session ? <Outlet /> : <Navigate to="/login" replace />;
}

function LoginRoute() {
  const { session, loading } = useAuth();
  if (loading) return <main className="flex min-h-screen items-center justify-center text-muted-foreground">Loading your session…</main>;
  return session ? <Navigate to="/journey" replace /> : <LoginPage />;
}

// Shown while VITE_AI_CHAT_ENABLED is off (PF-S15 rollout flag).
function ChatUnavailable() {
  return <main className="mx-auto max-w-xl px-6 py-20"><h1 className="font-title text-3xl">AI chat is paused</h1><p className="mt-3 text-muted-foreground">Chat comes back once it only reads your own data.</p></main>;
}

const App = () => (
  <AuthProvider>
    <TooltipProvider delayDuration={0}>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/journey" replace />} />
          <Route path="/login" element={<LoginRoute />} />
          {/* Legacy redirects — keep bookmarks working */}
          <Route path="/dashboard" element={<Navigate to="/journey" replace />} />
          <Route path="/upload" element={<Navigate to="/cashflow/upload" replace />} />
          <Route path="/transactions" element={<Navigate to="/cashflow/transactions" replace />} />
          <Route path="/categories" element={<Navigate to="/settings/categories" replace />} />
          <Route path="/status" element={<StatusPage />} />
          <Route element={<RequireAuth />}>
            <Route element={<ErrorBoundary><AppShell /></ErrorBoundary>}>
              <Route path="/chat" element={AI_CHAT_ENABLED ? <ChatPage /> : <ChatUnavailable />} />
              <Route path="/journey" element={<JourneyPage />} />
              <Route path="/journey/achievements" element={<AchievementsPage />} />
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
                {/* Same page as Assets > Accounts, so accounts can be managed from either place */}
                <Route path="accounts" element={<AssetsAccountsTab />} />
                <Route path="banks" element={<Navigate to="/settings/accounts" replace />} />
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
              {/* Trading Desk — separate top-level module, excluded from the reward/streak/achievement system */}
              <Route path="/desk" element={<DeskLayout />}>
                <Route index element={<Navigate to="/desk/command" replace />} />
                <Route path="command" element={<CommandTab />} />
                <Route path="portfolio" element={<PortfolioTab />} />
                <Route path="mandate" element={<MandateTab />} />
                <Route path="reconcile" element={<ReconcileTab />} />
              </Route>
              {/* Macro Scenario Lab — separate top-level module (PF-140), tabbed alongside Investment */}
              <Route path="/lab" element={<MacroLabPage />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </AuthProvider>
);

export default App;
