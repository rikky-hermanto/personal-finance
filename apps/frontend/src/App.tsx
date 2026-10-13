import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import CashflowPilotShell from '@/components/CashflowPilotShell';
import ErrorBoundary from '@/components/ErrorBoundary';
import LoginPage from '@/pages/auth/LoginPage';
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
import BanksTab from '@/pages/settings/BanksTab';
import StatusPage from '@/pages/StatusPage';

function RequireAuth() {
  const { session, loading } = useAuth();
  if (loading) return <main className="flex min-h-screen items-center justify-center text-muted-foreground">Loading your session…</main>;
  return session ? <Outlet /> : <Navigate to="/login" replace />;
}

function LoginRoute() {
  const { session, loading } = useAuth();
  if (loading) return <main className="flex min-h-screen items-center justify-center text-muted-foreground">Loading your session…</main>;
  return session ? <Navigate to="/cashflow/overview" replace /> : <LoginPage />;
}

function PilotUnavailable() {
  return <main className="mx-auto max-w-xl px-6 py-20"><h1 className="font-title text-3xl">Available after the pilot</h1><p className="mt-3 text-muted-foreground">This area is temporarily unavailable while private Cashflow is being introduced.</p></main>;
}

const App = () => (
  <AuthProvider>
    <TooltipProvider delayDuration={0}>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/cashflow/overview" replace />} />
          <Route path="/login" element={<LoginRoute />} />
          <Route path="/upload" element={<Navigate to="/cashflow/upload" replace />} />
          <Route path="/transactions" element={<Navigate to="/cashflow/transactions" replace />} />
          <Route path="/categories" element={<Navigate to="/settings/categories" replace />} />
          <Route path="/status" element={<StatusPage />} />
          <Route element={<RequireAuth />}>
            <Route element={<ErrorBoundary><CashflowPilotShell /></ErrorBoundary>}>
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
              <Route path="*" element={<PilotUnavailable />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </AuthProvider>
);

export default App;
