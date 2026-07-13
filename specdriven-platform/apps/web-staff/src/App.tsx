import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout, RequireAuth } from "./components/AppShell";
import { ApprovalsPage } from "./pages/ApprovalsPage";
import { ClientsPage } from "./pages/ClientsPage";
import { LoginPage } from "./pages/LoginPage";
import { NewTicketPage } from "./pages/NewTicketPage";
import { OverviewPage } from "./pages/OverviewPage";
import { ReportsPage } from "./pages/ReportsPage";
import { MasterPage } from "./pages/MasterPage";
import { TicketDetailPage } from "./pages/TicketDetailPage";
import { TicketsPage } from "./pages/TicketsPage";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/tickets" element={<TicketsPage />} />
          <Route path="/tickets/new" element={<NewTicketPage />} />
          <Route path="/tickets/:key" element={<TicketDetailPage />} />
          <Route path="/approvals" element={<ApprovalsPage />} />
          <Route path="/clients" element={<ClientsPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/master" element={<MasterPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
