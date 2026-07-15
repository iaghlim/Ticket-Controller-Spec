import type {
  Attachment,
  Client,
  Comment,
  CommentVisibility,
  Organization,
  Project,
  SlaPolicy,
  SlaState,
  Tag,
  Ticket,
  TicketStatus,
  TicketType,
  TimeEntry,
  User,
  UserRole,
  NotificationPrefs,
  StaffSettings,
} from "@specdriven/shared";

export const apiBaseUrl =
  import.meta.env.VITE_API_URL ?? "http://localhost:3000";

const TOKEN_KEY = "specdriven.staff.token";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  organizationId: string;
  organizationName: string;
  clientId: string | null;
  homeOrganizationId?: string;
  isPlatformContext?: boolean;
  actingOrganizationId?: string;
};

export type LoginResponse = {
  token: string;
  user: AuthUser;
  mode: string;
  csrfToken?: string;
};

/** Prioridades alinhadas ao desktop (PATCH /tickets/:key). */
export type TicketPriority = "baixa" | "media" | "alta" | "critica";

export type PatchTicketInput = {
  status?: TicketStatus;
  assigneeId?: string | null;
  ticketType?: TicketType;
  priority?: TicketPriority;
};

export type TicketSla = {
  state: SlaState;
  dueAt: string | Date | null;
  policy: SlaPolicy | null;
  elapsedBusinessMinutes: number | null;
  remainingBusinessMinutes: number | null;
  message?: string;
  responseMinutes?: number;
  resolutionMinutes?: number;
  firstResponseAt?: string | Date | null;
  resolvedAt?: string | Date | null;
};

export type TimeEntriesSummary = {
  hourLimitMinutes: number | null;
  approvedSeconds: number;
  approvedMinutes: number;
};

export type CreateTimeEntryInput = {
  seconds: number;
  note?: string | null;
  startedAt?: string | Date;
};

export type CreateTimeEntryResponse = {
  timeEntry: TimeEntry;
  requiresApproval: boolean;
  approval?: ApprovalRow;
};

export type SearchTicketHit = {
  id: string;
  key: string;
  title: string;
  status: TicketStatus;
  clientId: string;
  updatedAt: string | Date;
};

export type Invite = {
  id: string;
  email: string;
  role: UserRole;
  clientId: string | null;
  expiresAt: string | Date;
  createdAt: string | Date;
  acceptedAt: string | Date | null;
  token?: string;
};

export type CreateInviteInput = {
  email: string;
  role: UserRole;
  clientId?: string | null;
  expiresInDays?: number;
};

export type TicketsReport = {
  total: number;
  byStatus: Record<string, number>;
  byAssignee: Record<string, number>;
  unassigned: number;
};

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `API error ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

let csrfToken: string | null = null;

export function getCsrfToken(): string | null {
  return csrfToken;
}

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(
  path: string,
  options: RequestInit & { token?: string | null } = {},
): Promise<T> {
  const { token, headers, ...rest } = options;
  const auth = token === undefined ? getStoredToken() : token;
  const method = (rest.method ?? "GET").toUpperCase();
  const isMutation = ["POST", "PATCH", "PUT", "DELETE"].includes(method);

  const res = await fetch(`${apiBaseUrl}${path}`, {
    ...rest,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
      ...(isMutation && csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
      ...headers,
    },
  });

  let body: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = text;
    }
  }

  if (res.ok && body && typeof body === "object") {
    const maybeToken = (body as Record<string, unknown>).csrfToken;
    if (typeof maybeToken === "string") {
      setCsrfToken(maybeToken);
    }
  }

  if (!res.ok) {
    const errObj = body as { error?: string; message?: string } | null;
    throw new ApiError(
      res.status,
      body,
      errObj?.message ?? errObj?.error ?? `HTTP ${res.status}`,
    );
  }

  return body as T;
}

export async function login(email: string, password: string) {
  const res = await request<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
    token: null,
  });
  if (res && res.csrfToken) {
    setCsrfToken(res.csrfToken);
  }
  return res;
}

export function logout() {
  return request<{ ok: boolean }>("/auth/logout", {
    method: "POST",
  }).catch(() => ({ ok: false }))
    .finally(() => {
      setStoredToken(null);
      setCsrfToken(null);
    });
}

export function forgotPassword(email: string) {
  return request<{ ok: boolean; message: string }>("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
    token: null,
  });
}

export function resetPassword(token: string, password: string) {
  return request<{ ok: boolean; message: string }>("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, password }),
    token: null,
  });
}

export function me(token?: string) {
  return request<{ user: AuthUser }>("/auth/me", { token });
}

export function switchOrg(organizationId: string) {
  return request<LoginResponse>("/auth/switch-org", {
    method: "POST",
    body: JSON.stringify({ organizationId }),
  });
}

export function exitOrg() {
  return request<LoginResponse>("/auth/exit-org", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function listTickets() {
  return request<{ tickets: Ticket[] }>("/tickets");
}

export function getTicket(key: string) {
  return request<{ ticket: Ticket }>(`/tickets/${encodeURIComponent(key)}`);
}

export function createTicket(input: {
  key?: string;
  title: string;
  clientId: string;
  projectId: string;
  description?: string;
  status?: TicketStatus;
  priority?: string;
  ticketType?: string;
  module?: string;
}) {
  return request<{ ticket: Ticket }>("/tickets", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** Staff: atualiza status e/ou assigneeId (null remove). */
export function patchTicket(key: string, input: PatchTicketInput) {
  return request<{ ticket: Ticket; mail?: unknown }>(
    `/tickets/${encodeURIComponent(key)}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
}

export function listComments(key: string) {
  return request<{ comments: Comment[] }>(
    `/tickets/${encodeURIComponent(key)}/comments`,
  );
}

export function createComment(
  key: string,
  body: string,
  visibility: CommentVisibility = "public",
) {
  return request<{ comment: Comment }>(
    `/tickets/${encodeURIComponent(key)}/comments`,
    {
      method: "POST",
      body: JSON.stringify({ body, visibility }),
    },
  );
}

export function listAttachments(key: string) {
  return request<{
    attachments: Attachment[];
    storageConfigured?: boolean;
  }>(`/tickets/${encodeURIComponent(key)}/attachments`);
}

export function createAttachmentMeta(
  key: string,
  input: { fileName: string; mimeType?: string; sizeBytes?: number },
) {
  return request<{ attachment: Attachment; mode: string }>(
    `/tickets/${encodeURIComponent(key)}/attachments`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

/** Multipart upload (field `file`) → MinIO/S3 when storage is configured. */
export async function uploadAttachment(
  key: string,
  file: File,
): Promise<{ attachment: Attachment; mode: string }> {
  const auth = getStoredToken();
  const form = new FormData();
  form.append("file", file, file.name);
  const res = await fetch(
    `${apiBaseUrl}/tickets/${encodeURIComponent(key)}/attachments`,
    {
      method: "POST",
      credentials: "include",
      headers: {
        ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
        ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
      },
      body: form,
    },
  );
  let body: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = text;
    }
  }
  if (!res.ok) {
    const errObj = body as { error?: string; message?: string } | null;
    throw new ApiError(
      res.status,
      body,
      errObj?.message ?? errObj?.error ?? `HTTP ${res.status}`,
    );
  }
  return body as { attachment: Attachment; mode: string };
}

export function getAttachmentDownload(key: string, id: string) {
  return request<{ url: string; attachmentId: string; expiresInSeconds: number }>(
    `/tickets/${encodeURIComponent(key)}/attachments/${encodeURIComponent(id)}/download`,
  );
}

export function attachmentHasBinary(a: Attachment): boolean {
  return !a.storageKey.startsWith("local://");
}

export function listClients() {
  return request<{ clients: Client[] }>("/clients");
}

export function createClient(input: { name: string; code?: string }) {
  return request<{ client: Client }>("/clients", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listInvites() {
  return request<{ invites: Invite[] }>("/invites");
}

export function createInvite(input: CreateInviteInput) {
  return request<{ invite: Invite; mail?: unknown }>("/invites", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type AcceptInviteInput = {
  token: string;
  name: string;
  password: string;
};

export type AcceptInviteResponse = {
  user: Pick<User, "id" | "email" | "name" | "role" | "clientId"> & {
    organizationId: string;
  };
  message: string;
};

export function acceptInvite(input: AcceptInviteInput) {
  return request<AcceptInviteResponse>("/invites/accept", {
    method: "POST",
    body: JSON.stringify(input),
    token: null,
  });
}

export function ticketsReport() {
  return request<TicketsReport>("/reports/tickets");
}

export type ServiceHealthMetrics = {
  mtta: number | null;
  mttr: number | null;
  fcr: number | null;
  slaPct: number | null;
  targetSlaPct: number;
  changeSuccess: {
    ticket: number | null;
    hour_limit: number | null;
    time_entry: number | null;
  };
  baselineBurn: number;
  aging: {
    "0-3 days": number;
    "4-7 days": number;
    "8-14 days": number;
    "15-30 days": number;
    "30+ days": number;
  };
  baselineBurnTable: {
    clientId: string;
    clientName: string;
    hoursContracted: number;
    hoursUsed: number;
    burnPct: number;
  }[];
  throughput?: number | null;
  burnBudget?: number | null;
  revenuePerTicket?: number | null;
};

export type TrendPoint = {
  month: string;
  throughput: number;
  burnBudget: number;
  revenue: number;
};

export type TrendsReportResponse = {
  trends: TrendPoint[];
};

export function getServiceHealth(period: string, clientId?: string, projectId?: string) {
  const params = new URLSearchParams({ period });
  if (clientId) params.set("clientId", clientId);
  if (projectId) params.set("projectId", projectId);
  return request<ServiceHealthMetrics>(`/reports/service-health?${params.toString()}`);
}

export function getTrendsReport(projectId?: string) {
  const params = new URLSearchParams();
  if (projectId) params.set("projectId", projectId);
  return request<TrendsReportResponse>(`/reports/trends?${params.toString()}`);
}

export type ApprovalRow = {
  id: string;
  organizationId: string;
  kind: import("@specdriven/shared").ApprovalKind;
  status: import("@specdriven/shared").ApprovalStatus;
  ticketId: string;
  timeEntryId?: string | null;
  requesterId: string;
  reviewerId?: string | null;
  targetStatus?: import("@specdriven/shared").TicketStatus | null;
  requestedMinutes?: number | null;
  reason?: string | null;
  decisionNote?: string | null;
  decidedAt?: string | Date | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  ticket?: { key: string; title: string; hourLimitMinutes?: number | null };
  requester?: { id: string; name: string; email: string; role?: UserRole };
  reviewer?: { id: string; name: string; email: string; role?: UserRole } | null;
  timeEntry?: unknown;
};

export type CreateApprovalInput =
  | {
      kind: "ticket";
      ticketKey: string;
      targetStatus: import("@specdriven/shared").TicketStatus;
      reason?: string | null;
    }
  | {
      kind: "hour_limit";
      ticketKey: string;
      requestedMinutes: number;
      reason?: string | null;
    }
  | {
      kind: "time_entry";
      ticketKey: string;
      seconds: number;
      note?: string | null;
      reason?: string | null;
    };

export function listApprovals(opts?: {
  status?: import("@specdriven/shared").ApprovalStatus;
  kind?: import("@specdriven/shared").ApprovalKind;
  ticketKey?: string;
}) {
  const params = new URLSearchParams();
  if (opts?.status) params.set("status", opts.status);
  if (opts?.kind) params.set("kind", opts.kind);
  if (opts?.ticketKey) params.set("ticketKey", opts.ticketKey);
  const q = params.toString();
  return request<{ approvals: ApprovalRow[] }>(
    `/approvals${q ? `?${q}` : ""}`,
  );
}

export function createApproval(input: CreateApprovalInput) {
  return request<{ approval: ApprovalRow; timeEntry?: unknown }>(
    "/approvals",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export function approveApproval(id: string, decisionNote?: string) {
  return request<{ approval: ApprovalRow }>(`/approvals/${id}/approve`, {
    method: "POST",
    body: JSON.stringify({ decisionNote: decisionNote ?? null }),
  });
}

export function rejectApproval(id: string, decisionNote?: string) {
  return request<{ approval: ApprovalRow }>(`/approvals/${id}/reject`, {
    method: "POST",
    body: JSON.stringify({ decisionNote: decisionNote ?? null }),
  });
}

export function patchTicketHourLimit(
  key: string,
  hourLimitMinutes: number | null,
) {
  return request<{ ticket: Ticket }>(
    `/tickets/${encodeURIComponent(key)}/hour-limit`,
    {
      method: "PATCH",
      body: JSON.stringify({ hourLimitMinutes }),
    },
  );
}

/** Staff: lista usuários da org. `roles` → query `?role=gestor,consultor`. */
export function listUsers(roles?: UserRole[]) {
  const q =
    roles && roles.length > 0
      ? `?role=${encodeURIComponent(roles.join(","))}`
      : "";
  return request<{ users: User[] }>(`/users${q}`);
}

export function isStaffRole(role: UserRole): boolean {
  return (
    role === "master" ||
    role === "admin" ||
    role === "gestor" ||
    role === "consultor"
  );
}

export function listOrganizations() {
  return request<{ organizations: Organization[] }>("/organizations");
}

export function createOrganization(name: string) {
  return request<{ organization: Organization }>("/organizations", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function createOrgUser(
  organizationId: string,
  input: {
    email: string;
    name: string;
    password: string;
    role: UserRole;
    clientId?: string | null;
  },
) {
  return request<{ user: User }>(
    `/organizations/${encodeURIComponent(organizationId)}/users`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export type SupportTier = "N1" | "N2" | "N3";

export type ProjectModuleAssignment = {
  id: string;
  projectId: string;
  module: string;
  userId: string;
  tier: SupportTier;
  createdAt: string;
  updatedAt: string;
  user?: User;
};


export type UserProjectLink = {
  id: string;
  userId: string;
  projectId: string;
  active: boolean;
  project?: { id: string; name: string; code: string; clientId: string };
  user?: { id: string; name: string; email: string; role: string; clientId: string | null };
};

export function listUserProjects(userId?: string, projectId?: string) {
  const params = new URLSearchParams();
  if (userId) params.set("userId", userId);
  if (projectId) params.set("projectId", projectId);
  const qs = params.toString();
  return request<{ links: UserProjectLink[] }>(`/user-projects${qs ? `?${qs}` : ""}`);
}

export function linkUserToProject(projectId: string, userId: string) {
  return request<{ link: UserProjectLink }>(`/projects/${encodeURIComponent(projectId)}/users`, {
    method: "POST",
    body: JSON.stringify({ userId }),
  });
}

export function unlinkUserFromProject(projectId: string, userId: string) {
  return request<{ success: boolean }>(`/projects/${encodeURIComponent(projectId)}/users`, {
    method: "DELETE",
    body: JSON.stringify({ userId }),
  });
}

export function listProjects(clientId?: string) {
  const q = clientId ? `?clientId=${encodeURIComponent(clientId)}` : "";
  return request<{ projects: Project[] }>(`/projects${q}`);
}

export function createProject(input: {
  clientId: string;
  name: string;
  code: string;
  billingModel: "per_hour" | "per_ticket" | "fixed_project";
  baselineHoursMonth?: number | null;
  hourlyRateCents?: number | null;
  ticketRateCents?: number | null;
  budgetCents?: number | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
}) {
  return request<{ project: Project }>("/projects", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateProject(
  projectId: string,
  input: {
    name?: string;
    code?: string;
    billingModel?: "per_hour" | "per_ticket" | "fixed_project";
    baselineHoursMonth?: number | null;
    hourlyRateCents?: number | null;
    ticketRateCents?: number | null;
    budgetCents?: number | null;
    startDate?: string | Date | null;
    endDate?: string | Date | null;
  },
) {
  return request<{ project: Project }>(`/projects/${encodeURIComponent(projectId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function listProjectAssignments(projectId: string) {
  return request<{ assignments: ProjectModuleAssignment[] }>(
    `/settings/projects/${encodeURIComponent(projectId)}/assignments`
  );
}

export function createProjectAssignment(
  projectId: string,
  input: {
    module: string;
    userId: string;
    tier: SupportTier;
  }
) {
  return request<{ assignment: ProjectModuleAssignment }>(
    `/settings/projects/${encodeURIComponent(projectId)}/assignments`,
    {
      method: "POST",
      body: JSON.stringify(input),
    }
  );
}

export function deleteProjectAssignment(projectId: string, assignmentId: string) {
  return request<{ ok: boolean }>(
    `/settings/projects/${encodeURIComponent(projectId)}/assignments/${encodeURIComponent(assignmentId)}`,
    {
      method: "DELETE",
    }
  );
}

export function getTicketSla(key: string) {
  return request<{ sla: TicketSla }>(
    `/tickets/${encodeURIComponent(key)}/sla`,
  );
}

export function listTimeEntries(key: string) {
  return request<{
    timeEntries: TimeEntry[];
    summary: TimeEntriesSummary;
  }>(`/tickets/${encodeURIComponent(key)}/time-entries`);
}

export function createTimeEntry(key: string, input: CreateTimeEntryInput) {
  return request<CreateTimeEntryResponse>(
    `/tickets/${encodeURIComponent(key)}/time-entries`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export function listTags() {
  return request<{ tags: Tag[] }>("/tags");
}

export function listTicketTags(key: string) {
  return request<{ tags: Tag[] }>(
    `/tickets/${encodeURIComponent(key)}/tags`,
  );
}

export function putTicketTags(key: string, tagIds: string[]) {
  return request<{ tags: Tag[] }>(
    `/tickets/${encodeURIComponent(key)}/tags`,
    {
      method: "PUT",
      body: JSON.stringify({ tagIds }),
    },
  );
}

export function search(q: string, opts?: { limit?: number }) {
  const params = new URLSearchParams({ q });
  if (opts?.limit != null) params.set("limit", String(opts.limit));
  return request<{ q: string; tickets: SearchTicketHit[] }>(
    `/search?${params.toString()}`,
  );
}

export type Notification = {
  id: string;
  organizationId: string;
  userId: string;
  title: string;
  body: string | null;
  href: string | null;
  readAt: string | Date | null;
  createdAt: string | Date;
};

export function listNotifications(opts?: {
  unreadOnly?: boolean;
  limit?: number;
}) {
  const params = new URLSearchParams();
  if (opts?.unreadOnly) params.set("unreadOnly", "true");
  if (opts?.limit != null) params.set("limit", String(opts.limit));
  const q = params.toString();
  return request<{ notifications: Notification[]; unreadCount: number }>(
    `/notifications${q ? `?${q}` : ""}`,
  );
}

export function markNotificationRead(id: string) {
  return request<{ notification: Notification }>(
    `/notifications/${encodeURIComponent(id)}/read`,
    { method: "POST" },
  );
}

export function markAllNotificationsRead() {
  return request<{ updated: number }>("/notifications/read-all", {
    method: "POST",
  });
}

export type BillingSummary = {
  client: {
    id: string;
    name: string;
    baselineHoursMonth: number | null;
    hourlyRateCents: number | null;
  };
  range: { from: string; to: string };
  hoursUsed: number;
  baselineRemaining: number | null;
  costCentsInternal: number;
  byUser: {
    userId: string;
    name: string;
    seconds: number;
    costCents: number;
  }[];
  entryCount: number;
};

export function getBillingSummary(clientId: string, from: Date, to: Date) {
  const params = new URLSearchParams({
    clientId,
    from: from.toISOString(),
    to: to.toISOString(),
  });
  return request<BillingSummary>(`/billing/summary?${params.toString()}`);
}

export function patchClientBilling(
  id: string,
  input: {
    baselineHoursMonth?: number | null;
    hourlyRateCents?: number | null;
  },
) {
  return request<{ client: Client }>(
    `/clients/${encodeURIComponent(id)}/billing`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
}

export function patchUserBilling(id: string, hourRateFactor: number) {
  return request<{ user: User }>(`/users/${encodeURIComponent(id)}/billing`, {
    method: "PATCH",
    body: JSON.stringify({ hourRateFactor }),
  });
}

export function listSlaPolicies(clientId?: string) {
  const q = clientId ? `?clientId=${encodeURIComponent(clientId)}` : "";
  return request<{ policies: SlaPolicy[] }>(`/sla-policies${q}`);
}

export function createSlaPolicy(input: {
  clientId: string;
  name?: string;
  priorityMatch?: string;
  responseMinutes: number;
  resolutionMinutes: number;
  businessHourStart?: number;
  businessHourEnd?: number;
  weekdays?: string;
}) {
  return request<{ policy: SlaPolicy }>("/sla-policies", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function patchSlaPolicy(
  id: string,
  input: {
    name?: string;
    responseMinutes?: number;
    resolutionMinutes?: number;
    businessHourStart?: number;
    businessHourEnd?: number;
    weekdays?: string;
  },
) {
  return request<{ policy: SlaPolicy }>(
    `/sla-policies/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
}

export function deleteSlaPolicy(id: string) {
  return request<void>(`/sla-policies/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function createTag(input: {
  name: string;
  color?: string | null;
  visibleToClient?: boolean;
}) {
  return request<{ tag: Tag }>("/tags", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function patchTag(
  id: string,
  input: { name?: string; color?: string | null; visibleToClient?: boolean },
) {
  return request<{ tag: Tag }>(`/tags/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteTag(id: string) {
  return request<void>(`/tags/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export type StaffSettingsResponse = StaffSettings;

export type OrganizationHolidayItem = {
  id: string;
  organizationId: string;
  date: string | Date;
  name: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

export type TicketModuleCatalogItem = {
  id: string;
  organizationId: string;
  key: string;
  label: string;
  sortOrder: number;
  enabled: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
};

export function getSettings() {
  return request<StaffSettingsResponse>("/settings");
}

export function patchOrganizationSettings(input: {
  name?: string;
  supportEmail?: string | null;
  supportPolicyText?: string | null;
}) {
  return request<StaffSettingsResponse>("/settings/organization", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function patchPortalSettings(input: { enabledTicketTypes: TicketType[] }) {
  return request<StaffSettingsResponse>("/settings/portal", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function patchPortalKbSettings(input: {
  knowledgeBaseEnabled?: boolean;
  knowledgeBaseUrl?: string | null;
  portalHeroTitle?: string | null;
  portalHeroSubtitle?: string | null;
}) {
  return request<StaffSettingsResponse>("/settings/portal", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function patchEmailSettings(input: {
  fromName?: string | null;
  replyTo?: string | null;
  footerText?: string | null;
  smtpEnabled?: boolean;
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpUser?: string | null;
  smtpPass?: string | null;
  smtpFrom?: string | null;
}) {
  return request<StaffSettingsResponse>("/settings/email", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function patchNotificationSettings(input: {
  notificationPrefs: NotificationPrefs;
}) {
  return request<StaffSettingsResponse>("/settings/notifications", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function postEmailTest() {
  return request<{ mail: { delivered: boolean; provider: string } }>(
    "/settings/email/test",
    { method: "POST" },
  );
}

export function listModules() {
  return request<{ modules: TicketModuleCatalogItem[]; canEdit: boolean }>(
    "/settings/modules",
  );
}

export function createModule(input: {
  key: string;
  label: string;
  sortOrder?: number;
  enabled?: boolean;
}) {
  return request<{ module: TicketModuleCatalogItem }>("/settings/modules", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function patchModule(
  id: string,
  input: { label?: string; sortOrder?: number; enabled?: boolean },
) {
  return request<{ module: TicketModuleCatalogItem }>(
    `/settings/modules/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
}

export function deleteModule(id: string) {
  return request<void>(`/settings/modules/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function patchSlaSettings(input: {
  slaTargetPct?: number;
  defaultBusinessHours?: {
    businessHourStart: number;
    businessHourEnd: number;
    weekdays: string;
  } | null;
}) {
  return request<StaffSettingsResponse>("/settings/sla", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function postRecalculateOpenSla() {
  return request<{ ok: boolean; updated: number }>(
    "/settings/sla/recalculate-open",
    { method: "POST" },
  );
}

export function listHolidays() {
  return request<{ holidays: OrganizationHolidayItem[]; canEdit: boolean }>(
    "/settings/holidays",
  );
}

export function createHoliday(input: { date: string; name?: string | null }) {
  return request<{ holiday: OrganizationHolidayItem }>("/settings/holidays", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deleteHoliday(id: string) {
  return request<void>(`/settings/holidays/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export type AuditEvent = {
  id: string;
  organizationId: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metaJson: string | null;
  createdAt: string | Date;
};

export function listAudit(opts?: { limit?: number; entityType?: string }) {
  const params = new URLSearchParams();
  if (opts?.limit != null) params.set("limit", String(opts.limit));
  if (opts?.entityType) params.set("entityType", opts.entityType);
  const q = params.toString();
  return request<{ events: AuditEvent[] }>(`/audit${q ? `?${q}` : ""}`);
}

export function exportPrivacyData() {
  return request<Record<string, unknown>>("/privacy/export");
}

/** Multipart upload (field `file`) → logo da organização no portal cliente. */
export async function uploadOrganizationLogo(
  file: File,
): Promise<{ ok: boolean; logoUrl: string | null }> {
  const auth = getStoredToken();
  const form = new FormData();
  form.append("file", file, file.name);
  const res = await fetch(`${apiBaseUrl}/settings/organization/logo`, {
    method: "POST",
    credentials: "include",
    headers: {
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
      ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
    },
    body: form,
  });
  let body: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = text;
    }
  }
  if (!res.ok) {
    const errObj = body as { error?: string; message?: string } | null;
    throw new ApiError(
      res.status,
      body,
      errObj?.message ?? errObj?.error ?? `HTTP ${res.status}`,
    );
  }
  return body as { ok: boolean; logoUrl: string | null };
}

// --- MOCK PROBLEMS & CHANGES SYSTEM ---
export type ProblemStatus = "investigating" | "identified" | "known_error" | "closed";

export interface Problem {
  id: string;
  organizationId: string;
  title: string;
  description: string | null;
  status: ProblemStatus;
  rootCause: string | null;
  workaround: string | null;
  clientId: string | null;
  createdAt: string;
  updatedAt: string;
  incidents: Ticket[];
  changes: Change[];
}

export type ChangeStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "implementing"
  | "completed"
  | "failed";

export interface Change {
  id: string;
  organizationId: string;
  title: string;
  description: string | null;
  status: ChangeStatus;
  riskScore: number;
  rollbackPlan: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  cabDecision: string | null;
  cabDecisionNote: string | null;
  cabDecisionAt: string | null;
  problemId: string | null;
  createdAt: string;
  updatedAt: string;
  tickets?: Ticket[];
  problem?: Problem | null;
}

const INITIAL_PROBLEMS = [
  {
    id: "prob-1",
    organizationId: "default-org",
    title: "Instabilidade nos servidores de banco de dados",
    description: "Quedas intermitentes de conexão com o banco de dados afetando o portal cliente em horários de pico.",
    status: "identified" as ProblemStatus,
    rootCause: "Estouro de memória RAM causado por consultas lentas sem índice adequado na tabela ticket_tags.",
    workaround: "Reiniciar o serviço de banco de dados quando o consumo de RAM passar de 90%.",
    clientId: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "prob-2",
    organizationId: "default-org",
    title: "Erro 502 Bad Gateway intermitente no upload de anexos",
    description: "Alguns clientes relatam erro 502 ao fazer upload de arquivos PDF maiores que 5MB.",
    status: "investigating" as ProblemStatus,
    rootCause: "",
    workaround: "Instruir os clientes a comprimirem os arquivos PDF antes do envio.",
    clientId: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
];

const INITIAL_CHANGES = [
  {
    id: "change-1",
    organizationId: "default-org",
    title: "Adição de índices e redimensionamento da CPU/RAM do banco de dados",
    description: "Criar índices faltantes na tabela ticket_tags e migrar banco de dados para instância com o dobro de RAM.",
    status: "pending_approval" as ChangeStatus,
    riskScore: 3,
    rollbackPlan: "Restaurar backup do snapshot pré-migração e reverter apontamento DNS.",
    windowStart: new Date(Date.now() + 86400000 * 3).toISOString(),
    windowEnd: new Date(Date.now() + 86400000 * 3 + 14400000).toISOString(),
    cabDecision: null,
    cabDecisionNote: null,
    cabDecisionAt: null,
    problemId: "prob-1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
];

const INITIAL_INCIDENTS = [
  { problemId: "prob-1", ticketKey: "DEMO-1" }
];

function initMocks() {
  if (!localStorage.getItem("specdriven.problems")) {
    localStorage.setItem("specdriven.problems", JSON.stringify(INITIAL_PROBLEMS));
  }
  if (!localStorage.getItem("specdriven.changes")) {
    localStorage.setItem("specdriven.changes", JSON.stringify(INITIAL_CHANGES));
  }
  if (!localStorage.getItem("specdriven.problem_incidents")) {
    localStorage.setItem("specdriven.problem_incidents", JSON.stringify(INITIAL_INCIDENTS));
  }
}

export async function listProblems(clientId?: string, status?: ProblemStatus): Promise<Problem[]> {
  initMocks();
  await new Promise((resolve) => setTimeout(resolve, 300));
  const problems = JSON.parse(localStorage.getItem("specdriven.problems") || "[]") as any[];
  const incs = JSON.parse(localStorage.getItem("specdriven.problem_incidents") || "[]") as any[];
  
  let tickets: Ticket[] = [];
  try {
    const res = await listTickets();
    tickets = res.tickets;
  } catch (e) {
    // ignore
  }

  const result: Problem[] = [];
  for (const p of problems) {
    const pKeys = incs.filter((i: any) => i.problemId === p.id).map((i: any) => i.ticketKey);
    const pTickets = tickets.filter((t) => pKeys.includes(t.key));
    
    const firstTicketClient = pTickets[0]?.clientId || null;
    const finalClientId = p.clientId || firstTicketClient;

    if (clientId && finalClientId !== clientId) continue;
    if (status && p.status !== status) continue;

    result.push({
      ...p,
      clientId: finalClientId,
      incidents: pTickets,
      changes: [],
    });
  }

  return result;
}

export async function getProblem(id: string): Promise<Problem | null> {
  initMocks();
  await new Promise((resolve) => setTimeout(resolve, 200));
  const problems = JSON.parse(localStorage.getItem("specdriven.problems") || "[]") as any[];
  const p = problems.find((x: any) => x.id === id);
  if (!p) return null;

  const incs = JSON.parse(localStorage.getItem("specdriven.problem_incidents") || "[]") as any[];
  const pKeys = incs.filter((i: any) => i.problemId === p.id).map((i: any) => i.ticketKey);
  
  let tickets: Ticket[] = [];
  try {
    const res = await listTickets();
    tickets = res.tickets;
  } catch (e) {}

  const pTickets = tickets.filter((t) => pKeys.includes(t.key));
  const firstTicketClient = pTickets[0]?.clientId || null;

  const changes = JSON.parse(localStorage.getItem("specdriven.changes") || "[]") as any[];
  const pChanges = changes.filter((c: any) => c.problemId === p.id);

  return {
    ...p,
    clientId: p.clientId || firstTicketClient,
    incidents: pTickets,
    changes: pChanges,
  };
}

export async function createProblem(input: {
  title: string;
  description?: string;
  clientId?: string;
}): Promise<Problem> {
  initMocks();
  await new Promise((resolve) => setTimeout(resolve, 300));
  const problems = JSON.parse(localStorage.getItem("specdriven.problems") || "[]") as any[];
  const newProb = {
    id: `prob-${Math.random().toString(36).substr(2, 9)}`,
    organizationId: "default-org",
    title: input.title,
    description: input.description || null,
    status: "investigating" as ProblemStatus,
    rootCause: null,
    workaround: null,
    clientId: input.clientId || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  problems.push(newProb);
  localStorage.setItem("specdriven.problems", JSON.stringify(problems));
  return {
    ...newProb,
    incidents: [],
    changes: [],
  };
}

export async function patchProblem(
  id: string,
  input: {
    title?: string;
    description?: string | null;
    status?: ProblemStatus;
    rootCause?: string | null;
    workaround?: string | null;
  }
): Promise<Problem> {
  initMocks();
  await new Promise((resolve) => setTimeout(resolve, 200));
  const problems = JSON.parse(localStorage.getItem("specdriven.problems") || "[]") as any[];
  const idx = problems.findIndex((x: any) => x.id === id);
  if (idx === -1) throw new Error("Problem not found");

  const updated = {
    ...problems[idx],
    ...input,
    updatedAt: new Date().toISOString(),
  };
  problems[idx] = updated;
  localStorage.setItem("specdriven.problems", JSON.stringify(problems));
  
  const full = await getProblem(id);
  if (!full) throw new Error("Failed to reload problem");
  return full;
}

export async function linkIncidentToProblem(problemId: string, ticketKey: string): Promise<void> {
  initMocks();
  await new Promise((resolve) => setTimeout(resolve, 200));
  const incs = JSON.parse(localStorage.getItem("specdriven.problem_incidents") || "[]") as any[];
  const exists = incs.some((i: any) => i.problemId === problemId && i.ticketKey === ticketKey);
  if (!exists) {
    incs.push({ problemId, ticketKey });
    localStorage.setItem("specdriven.problem_incidents", JSON.stringify(incs));
  }
}

export async function unlinkIncidentFromProblem(problemId: string, ticketKey: string): Promise<void> {
  initMocks();
  await new Promise((resolve) => setTimeout(resolve, 200));
  let incs = JSON.parse(localStorage.getItem("specdriven.problem_incidents") || "[]") as any[];
  incs = incs.filter((i: any) => !(i.problemId === problemId && i.ticketKey === ticketKey));
  localStorage.setItem("specdriven.problem_incidents", JSON.stringify(incs));
}

export async function listChanges(): Promise<Change[]> {
  initMocks();
  await new Promise((resolve) => setTimeout(resolve, 300));
  const changes = JSON.parse(localStorage.getItem("specdriven.changes") || "[]") as any[];
  return changes;
}

export async function getChange(id: string): Promise<Change | null> {
  initMocks();
  await new Promise((resolve) => setTimeout(resolve, 200));
  const changes = JSON.parse(localStorage.getItem("specdriven.changes") || "[]") as any[];
  const c = changes.find((x: any) => x.id === id);
  if (!c) return null;

  let problem: Problem | null = null;
  if (c.problemId) {
    problem = await getProblem(c.problemId);
  }

  return {
    ...c,
    problem,
  };
}

export async function createChange(input: {
  title: string;
  description?: string;
  riskScore?: number;
  rollbackPlan?: string;
  windowStart?: string | null;
  windowEnd?: string | null;
  problemId?: string | null;
}): Promise<Change> {
  initMocks();
  await new Promise((resolve) => setTimeout(resolve, 300));
  const changes = JSON.parse(localStorage.getItem("specdriven.changes") || "[]") as any[];
  const newChange = {
    id: `change-${Math.random().toString(36).substr(2, 9)}`,
    organizationId: "default-org",
    title: input.title,
    description: input.description || null,
    status: "draft" as ChangeStatus,
    riskScore: input.riskScore || 1,
    rollbackPlan: input.rollbackPlan || null,
    windowStart: input.windowStart || null,
    windowEnd: input.windowEnd || null,
    cabDecision: null,
    cabDecisionNote: null,
    cabDecisionAt: null,
    problemId: input.problemId || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  changes.push(newChange);
  localStorage.setItem("specdriven.changes", JSON.stringify(changes));
  return newChange;
}

export async function patchChange(
  id: string,
  input: {
    status?: ChangeStatus;
    windowStart?: string | null;
    windowEnd?: string | null;
    riskScore?: number;
    rollbackPlan?: string | null;
    description?: string | null;
    cabDecision?: string | null;
    cabDecisionNote?: string | null;
    cabDecisionAt?: string | null;
  }
): Promise<Change> {
  initMocks();
  await new Promise((resolve) => setTimeout(resolve, 200));
  const changes = JSON.parse(localStorage.getItem("specdriven.changes") || "[]") as any[];
  const idx = changes.findIndex((x: any) => x.id === id);
  if (idx === -1) throw new Error("Change not found");

  const updated = {
    ...changes[idx],
    ...input,
    updatedAt: new Date().toISOString(),
  };
  changes[idx] = updated;
  localStorage.setItem("specdriven.changes", JSON.stringify(changes));
  
  const full = await getChange(id);
  if (!full) throw new Error("Failed to reload change");
  return full;
}

export async function submitChangeForApproval(id: string): Promise<Change> {
  return patchChange(id, { status: "pending_approval" });
}

export async function decideCabChange(
  id: string,
  cabDecision: "approved" | "rejected",
  note?: string
): Promise<Change> {
  return patchChange(id, {
    status: cabDecision === "approved" ? "approved" : "rejected",
    cabDecision,
    cabDecisionNote: note || null,
    cabDecisionAt: new Date().toISOString(),
  });
}

// --- MOCK RISKS SYSTEM ---
export interface Risk {
  id: string;
  organizationId: string;
  title: string;
  description: string | null;
  probability: number; // 1-5
  impact: number; // 1-5
  status: "open" | "mitigated" | "avoided" | "transferred" | "accepted";
  mitigationPlan: string | null;
  problemId: string | null;
  changeId: string | null;
  createdAt: string;
  updatedAt: string;
  problem?: Problem | null;
  change?: Change | null;
}

const INITIAL_RISKS: Risk[] = [
  {
    id: "risk-1",
    organizationId: "default-org",
    title: "Indisponibilidade do banco de dados na migração",
    description: "Risco de indisponibilidade prolongada durante a migração da CPU/RAM do banco de dados.",
    probability: 2,
    impact: 4,
    status: "open",
    mitigationPlan: "Executar a migração no domingo às 02:00 e testar restore de backup previamente.",
    problemId: "prob-1",
    changeId: "change-1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "risk-2",
    organizationId: "default-org",
    title: "Sobrecarga de chamados no go-live",
    description: "Aumento expressivo no volume de chamados de suporte devido a dúvidas sobre o novo layout.",
    probability: 4,
    impact: 3,
    status: "open",
    mitigationPlan: "Escalar equipe de plantão para suporte nível 1 nas primeiras 48 horas.",
    problemId: null,
    changeId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
];

function initRiskMocks() {
  if (!localStorage.getItem("specdriven.risks")) {
    localStorage.setItem("specdriven.risks", JSON.stringify(INITIAL_RISKS));
  }
}

export async function listRisks(): Promise<Risk[]> {
  initRiskMocks();
  await new Promise((resolve) => setTimeout(resolve, 200));
  const risks = JSON.parse(localStorage.getItem("specdriven.risks") || "[]") as Risk[];
  const problems = JSON.parse(localStorage.getItem("specdriven.problems") || "[]") as Problem[];
  const changes = JSON.parse(localStorage.getItem("specdriven.changes") || "[]") as Change[];

  return risks.map((r) => ({
    ...r,
    problem: problems.find((p) => p.id === r.problemId) || null,
    change: changes.find((c) => c.id === r.changeId) || null,
  }));
}

export async function createRisk(input: {
  title: string;
  description?: string;
  probability: number;
  impact: number;
  status?: Risk["status"];
  mitigationPlan?: string;
  problemId?: string | null;
  changeId?: string | null;
}): Promise<Risk> {
  initRiskMocks();
  await new Promise((resolve) => setTimeout(resolve, 250));
  const risks = JSON.parse(localStorage.getItem("specdriven.risks") || "[]") as Risk[];
  const newRisk: Risk = {
    id: `risk-${Math.random().toString(36).substr(2, 9)}`,
    organizationId: "default-org",
    title: input.title,
    description: input.description || null,
    probability: input.probability,
    impact: input.impact,
    status: input.status || "open",
    mitigationPlan: input.mitigationPlan || null,
    problemId: input.problemId || null,
    changeId: input.changeId || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  risks.push(newRisk);
  localStorage.setItem("specdriven.risks", JSON.stringify(risks));
  return newRisk;
}

export async function patchRisk(
  id: string,
  input: Partial<Pick<Risk, "title" | "description" | "probability" | "impact" | "status" | "mitigationPlan" | "problemId" | "changeId">>
): Promise<Risk> {
  initRiskMocks();
  await new Promise((resolve) => setTimeout(resolve, 200));
  const risks = JSON.parse(localStorage.getItem("specdriven.risks") || "[]") as Risk[];
  const idx = risks.findIndex((x) => x.id === id);
  if (idx === -1) throw new Error("Risk not found");

  const updated: Risk = {
    ...risks[idx],
    ...input,
    updatedAt: new Date().toISOString(),
  };
  risks[idx] = updated;
  localStorage.setItem("specdriven.risks", JSON.stringify(risks));

  const problems = JSON.parse(localStorage.getItem("specdriven.problems") || "[]") as Problem[];
  const changes = JSON.parse(localStorage.getItem("specdriven.changes") || "[]") as Change[];
  return {
    ...updated,
    problem: problems.find((p) => p.id === updated.problemId) || null,
    change: changes.find((c) => c.id === updated.changeId) || null,
  };
}

