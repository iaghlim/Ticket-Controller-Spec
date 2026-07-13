/**
 * Cliente HTTP do desktop SpecDriven → API cloud (Fase D).
 * Roda no frontend Tauri (fetch); token fica em AppConfig.cloud.
 * Mesma API e credenciais do portal do consultor (web-staff).
 */

import type { CloudConfig, CloudMode } from "./types";

export type { CloudConfig, CloudMode };

export type UserRole = "gestor" | "consultor" | "cliente";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  organizationId: string;
  clientId: string | null;
};

export type LoginResponse = {
  token: string;
  user: AuthUser;
  mode: string;
};

export class CloudApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `API error ${status}`);
    this.name = "CloudApiError";
    this.status = status;
    this.body = body;
  }
}

export function isStaffRole(role: UserRole): boolean {
  return role === "gestor" || role === "consultor";
}

export function assertStaffUser(user: AuthUser): AuthUser {
  if (!isStaffRole(user.role)) {
    throw new CloudApiError(
      403,
      { error: "staff_only" },
      "Este app é exclusivo para gestor/consultor. Use o portal do cliente.",
    );
  }
  return user;
}

export const defaultCloudConfig = (): CloudConfig => ({
  mode: "local",
  apiUrl: "http://127.0.0.1:3000",
  token: null,
  email: null,
  lastSyncAt: null,
});

export function cloudFromConfig(
  cfg: { cloud?: CloudConfig } | null | undefined,
): CloudConfig {
  return { ...defaultCloudConfig(), ...(cfg?.cloud ?? {}) };
}

async function apiFetch<T>(
  cloud: CloudConfig,
  path: string,
  init?: RequestInit & { token?: string | null },
): Promise<T> {
  const base = (cloud.apiUrl || "http://127.0.0.1:3000").replace(/\/$/, "");
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }
  const authToken = init?.token === undefined ? cloud.token : init.token;
  if (authToken) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }
  const { token: _token, ...rest } = init ?? {};
  const res = await fetch(`${base}${path}`, { ...rest, headers });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const errObj = body as { error?: string; message?: string } | null;
    throw new CloudApiError(
      res.status,
      body,
      errObj?.message ?? errObj?.error ?? `HTTP ${res.status}`,
    );
  }
  return body as T;
}

export async function cloudLogin(
  cloud: CloudConfig,
  email: string,
  password: string,
): Promise<LoginResponse> {
  return apiFetch<LoginResponse>(cloud, "/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
    token: null,
  });
}

export async function cloudMe(cloud: CloudConfig): Promise<{ user: AuthUser }> {
  if (!cloud.token) {
    throw new CloudApiError(401, { error: "no_token" }, "Sem token de sessão.");
  }
  return apiFetch<{ user: AuthUser }>(cloud, "/auth/me");
}

export async function cloudSyncPull(cloud: CloudConfig): Promise<CloudPullResult> {
  const qs = cloud.lastSyncAt
    ? `?since=${encodeURIComponent(cloud.lastSyncAt)}`
    : "";
  return apiFetch(cloud, `/sync/pull${qs}`);
}

export interface CloudPullTicketClient {
  id?: string;
  name: string;
  code?: string | null;
}

export interface CloudPullTicket {
  id?: string;
  key: string;
  title: string;
  description?: string | null;
  status: string;
  priority?: string | null;
  estimateMinutes?: number | null;
  createdAt: string;
  updatedAt: string;
  client: CloudPullTicketClient;
  assignee?: { id?: string; name?: string; email?: string } | null;
}

export interface CloudPullComment {
  id: string;
  body: string;
  visibility?: string;
  createdAt: string;
  ticket: { key: string };
  author?: { id?: string; name?: string; email?: string } | null;
}

export interface CloudPullTimeEntry {
  id: string;
  startedAt: string;
  endedAt?: string | null;
  seconds?: number | null;
  note?: string | null;
  ticket: { key: string };
}

export interface CloudPullResult {
  serverTime: string;
  tickets: CloudPullTicket[];
  comments: CloudPullComment[];
  timeEntries: CloudPullTimeEntry[];
}

export interface CloudPullApplyResult {
  ticketsCreated: number;
  ticketsUpdated: number;
  commentsAppended: number;
  timeEntriesMerged: number;
  skipped: string[];
}

export async function cloudSyncPush(
  cloud: CloudConfig,
  payload: {
    timeEntries?: Array<{
      ticketKey: string;
      startedAt: string;
      endedAt?: string | null;
      seconds?: number | null;
      note?: string | null;
      clientLocalId?: string;
    }>;
    comments?: Array<{
      ticketKey: string;
      body: string;
      visibility?: "public" | "internal";
    }>;
  },
): Promise<{ serverTime: string }> {
  return apiFetch(cloud, "/sync/push", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** Upload .docx gerado como anexo multipart do ticket cloud. */
export async function cloudUploadDocx(
  cloud: CloudConfig,
  ticketKey: string,
  fileName: string,
  bytes: Uint8Array,
): Promise<unknown> {
  const base = (cloud.apiUrl || "http://127.0.0.1:3000").replace(/\/$/, "");
  const form = new FormData();
  form.append(
    "file",
    new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
    fileName,
  );
  const res = await fetch(
    `${base}/tickets/${encodeURIComponent(ticketKey)}/attachments`,
    {
      method: "POST",
      headers: cloud.token
        ? { Authorization: `Bearer ${cloud.token}` }
        : undefined,
      body: form,
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}
