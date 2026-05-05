import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AppShell from "@/components/AppShell";
import DashboardPage from "@/pages/DashboardPage";
import CashflowLayout from "@/pages/cashflow/CashflowLayout";
import OverviewTab from "@/pages/cashflow/OverviewTab";
import TransactionsTab from "@/pages/cashflow/TransactionsTab";
import UploadTab from "@/pages/cashflow/UploadTab";
import StatementTab from "@/pages/cashflow/StatementTab";
import SettingsLayout from "@/pages/settings/SettingsLayout";
import CategoriesTab from "@/pages/settings/CategoriesTab";
import DataTab from "@/pages/settings/DataTab";
import RegionalTab from "@/pages/settings/RegionalTab";
import NotFound from "@/pages/NotFound";
import StatusPage from "@/pages/StatusPage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          {/* Legacy redirects — keep bookmarks working */}
          <Route path="/upload" element={<Navigate to="/cashflow/upload" replace />} />
          <Route path="/transactions" element={<Navigate to="/cashflow/transactions" replace />} />
          <Route path="/categories" element={<Navigate to="/settings/categories" replace />} />
          <Route element={<AppShell />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/cashflow" element={<CashflowLayout />}>
              <Route index element={<Navigate to="/cashflow/overview" replace />} />
              <Route path="overview" element={<OverviewTab />} />
              <Route path="transactions" element={<TransactionsTab />} />
              <Route path="upload" element={<UploadTab />} />
              <Route path="statement" element={<StatementTab />} />
            </Route>
            <Route path="/settings" element={<SettingsLayout />}>
              <Route index element={<Navigate to="/settings/categories" replace />} />
              <Route path="categories" element={<CategoriesTab />} />
              <Route path="regional" element={<RegionalTab />} />
              <Route path="data" element={<DataTab />} />
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
