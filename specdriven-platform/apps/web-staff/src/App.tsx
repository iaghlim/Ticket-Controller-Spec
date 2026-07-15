import { Navigate, Route, Routes } from "react-router-dom";

import { AppLayout, RequireAuth } from "./components/AppShell";
import { RequireOrgContext } from "./components/RequireOrgContext";

import { ApprovalsPage } from "./pages/ApprovalsPage";
import { BillingPage } from "./pages/BillingPage";
import { ClientsPage } from "./pages/ClientsPage";
import { AcceptInvitePage } from "./pages/AcceptInvitePage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { LoginPage } from "./pages/LoginPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { NewTicketPage } from "./pages/NewTicketPage";
import { OverviewPage } from "./pages/OverviewPage";
import { ReportsPage } from "./pages/ReportsPage";
import { ServiceHealthPage } from "./pages/ServiceHealthPage";
import { MasterPage } from "./pages/MasterPage";
import { SlaPoliciesPage } from "./pages/SlaPoliciesPage";

import { CatalogSettingsPage } from "./pages/settings/CatalogSettingsPage";
import { EmailSettingsPage } from "./pages/settings/EmailSettingsPage";
import { NotificationSettingsPage } from "./pages/settings/NotificationSettingsPage";
import { PortalSettingsPage } from "./pages/settings/PortalSettingsPage";

import { TicketDetailPage } from "./pages/TicketDetailPage";
import { TicketsPage } from "./pages/TicketsPage";

import { ProblemsPage } from "./pages/ProblemsPage";
import { ProblemDetailPage } from "./pages/ProblemDetailPage";
import { ChangesPage } from "./pages/ChangesPage";
import { ChangeDetailPage } from "./pages/ChangeDetailPage";
import { KnowledgePage } from "./pages/KnowledgePage";
import { RisksPage } from "./pages/RisksPage";

import { OrganizationSettingsPage } from "./pages/settings/OrganizationSettingsPage";
import { AuditSettingsPage } from "./pages/settings/AuditSettingsPage";
import { PrivacySettingsPage } from "./pages/settings/PrivacySettingsPage";
import { ProjectsSettingsPage } from "./pages/settings/ProjectsSettingsPage";
import { UsersSettingsPage } from "./pages/settings/UsersSettingsPage";
import { SettingsIndexPage } from "./pages/settings/SettingsIndexPage";
import { SettingsLayout } from "./pages/settings/SettingsLayout";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/accept-invite" element={<AcceptInvitePage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path="/master" element={<MasterPage />} />
          <Route element={<RequireOrgContext />}>
            <Route path="/" element={<OverviewPage />} />
            <Route path="/tickets" element={<TicketsPage />} />
            <Route path="/tickets/new" element={<NewTicketPage />} />
            <Route path="/tickets/:key" element={<TicketDetailPage />} />
            
            <Route path="/problems" element={<ProblemsPage />} />
            <Route path="/problems/:id" element={<ProblemDetailPage />} />
            <Route path="/changes" element={<ChangesPage />} />
            <Route path="/changes/:id" element={<ChangeDetailPage />} />
            <Route path="/risks" element={<RisksPage />} />
            <Route path="/knowledge" element={<KnowledgePage />} />
            
            <Route path="/approvals" element={<ApprovalsPage />} />
            <Route path="/clients" element={<ClientsPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/reports/health" element={<ServiceHealthPage />} />
            <Route path="/settings" element={<SettingsLayout />}>
              <Route index element={<SettingsIndexPage />} />
              <Route path="organization" element={<OrganizationSettingsPage />} />
              <Route path="sla" element={<SlaPoliciesPage />} />
              <Route path="billing" element={<BillingPage />} />
              <Route path="catalog" element={<CatalogSettingsPage />} />
              <Route path="email" element={<EmailSettingsPage />} />
              <Route path="notifications" element={<NotificationSettingsPage />} />
              <Route path="portal" element={<PortalSettingsPage />} />
              <Route path="projects" element={<ProjectsSettingsPage />} />
              <Route path="users" element={<UsersSettingsPage />} />
              <Route path="audit" element={<AuditSettingsPage />} />
              <Route path="privacy" element={<PrivacySettingsPage />} />
            </Route>
            <Route path="/billing" element={<Navigate to="/settings/billing" replace />} />
            <Route path="/sla-policies" element={<Navigate to="/settings/sla" replace />} />
            <Route path="/tags" element={<Navigate to="/settings/catalog" replace />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
