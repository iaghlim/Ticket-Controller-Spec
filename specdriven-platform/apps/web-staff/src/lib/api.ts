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
};

export type LoginResponse = {
  token: string;
  user: AuthUser;
  mode: string;
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
  const res = await fetch(`${apiBaseUrl}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
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

export function login(email: string, password: string) {
  return request<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
    token: null,
  });
}

export function me(token?: string) {
  return request<{ user: AuthUser }>("/auth/me", { token });
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
  description?: string;
  status?: TicketStatus;
  priority?: string;
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
      headers: auth ? { Authorization: `Bearer ${auth}` } : {},
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

export function ticketsReport() {
  return request<TicketsReport>("/reports/tickets");
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

export function listProjects(clientId?: string) {
  const q = clientId ? `?clientId=${encodeURIComponent(clientId)}` : "";
  return request<{ projects: Project[] }>(`/projects${q}`);
}

export function createProject(input: {
  clientId: string;
  name: string;
  code?: string | null;
}) {
  return request<{ project: Project }>("/projects", {
    method: "POST",
    body: JSON.stringify(input),
  });
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
