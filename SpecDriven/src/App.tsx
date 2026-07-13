import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { WorkspaceProvider, useWorkspace } from "./shared/workspace";
import { CloudAuthProvider, useCloudAuth } from "./shared/cloud-auth";
import { AppLayout } from "./app/AppLayout";
import { SetupPage } from "./features/setup/SetupPage";
import { CloudLoginPage } from "./features/auth/CloudLoginPage";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { ClientsPage } from "./features/clients/ClientsPage";
import { ClientTicketsPage } from "./features/tickets/ClientTicketsPage";
import { TicketDetailPage } from "./features/tickets/TicketDetailPage";
import { DocumentWizardPage } from "./features/documents/DocumentWizardPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { TicketsReportPage } from "./features/reports/TicketsReportPage";
import type { ReactNode } from "react";

function CloudGate({ children }: { children: ReactNode }) {
  const { isCloudMode, user, loading } = useCloudAuth();

  if (isCloudMode) {
    if (loading) {
      return <div className="setup-page">Validando sessão cloud…</div>;
    }
    if (!user) {
      return <CloudLoginPage />;
    }
  }

  return children;
}

function RootGate() {
  const { config, loading } = useWorkspace();
  if (loading && !config) {
    return <div className="setup-page">Carregando SpecDriven…</div>;
  }
  if (!config?.rootPath) {
    return <SetupPage />;
  }
  return (
    <CloudGate>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="clientes" element={<ClientsPage />} />
          <Route path="clientes/:clientName" element={<ClientTicketsPage />} />
          <Route path="chamados/:clientName/:ticketKey" element={<TicketDetailPage />} />
          <Route
            path="chamados/:clientName/:ticketKey/docs/:docType"
            element={<DocumentWizardPage />}
          />
          <Route path="relatorios/chamados" element={<TicketsReportPage />} />
          <Route path="configuracoes" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </CloudGate>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <WorkspaceProvider>
        <CloudAuthProvider>
          <RootGate />
        </CloudAuthProvider>
      </WorkspaceProvider>
    </BrowserRouter>
  );
}
