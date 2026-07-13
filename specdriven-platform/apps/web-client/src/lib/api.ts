import type {
  Attachment,
  Comment,
  Ticket,
  TicketModule,
  TicketType,
  UserRole,
} from "@specdriven/shared";

export const apiBaseUrl =
  import.meta.env.VITE_API_URL ?? "http://localhost:3000";

const TOKEN_KEY = "specdriven.client.token";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  organizationId: string;
  organizationName?: string;
  clientId: string | null;
};

export type LoginResponse = {
  token: string;
  user: AuthUser;
  mode: string;
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

export function listTickets(opts?: { status?: string }) {
  const qs =
    opts?.status && opts.status !== "all"
      ? `?status=${encodeURIComponent(opts.status)}`
      : "";
  return request<{ tickets: Ticket[] }>(`/tickets${qs}`);
}

export function getTicket(key: string) {
  return request<{ ticket: Ticket }>(`/tickets/${encodeURIComponent(key)}`);
}

export function listClients() {
  return request<{ clients: { id: string; name: string; code?: string | null }[] }>(
    "/clients",
  );
}

export function getPlatformMeta() {
  return request<{
    flags?: { storageConfigured?: boolean };
    domain?: { ticketTypes?: TicketType[]; ticketModules?: TicketModule[] };
  }>("/_meta/routes");
}

export function createTicket(input: {
  title: string;
  clientId: string;
  description?: string;
  ticketType?: TicketType;
  companyName?: string;
  module?: TicketModule;
}) {
  return request<{ ticket: Ticket }>("/tickets", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listComments(key: string) {
  return request<{ comments: Comment[] }>(
    `/tickets/${encodeURIComponent(key)}/comments`,
  );
}

export function createComment(key: string, body: string) {
  return request<{ comment: Comment }>(
    `/tickets/${encodeURIComponent(key)}/comments`,
    {
      method: "POST",
      body: JSON.stringify({ body, visibility: "public" }),
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
