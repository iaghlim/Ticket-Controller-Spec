export type TicketStatus =
  | "backlog"
  | "em_andamento"
  | "aguardando_cliente"
  | "em_teste"
  | "concluido"
  | "cancelado";

export type Priority = "baixa" | "media" | "alta" | "critica";

export interface UiConfig {
  theme: string;
}

export type CloudMode = "local" | "cloud";

export interface CloudConfig {
  mode: CloudMode;
  apiUrl: string;
  token?: string | null;
  email?: string | null;
  lastSyncAt?: string | null;
}

export interface AppConfig {
  rootPath?: string | null;
  authorDefault: string;
  recentRoots: string[];
  ui: UiConfig;
  emptyPlaceholder: string;
  cloud?: CloudConfig;
}

export type DocumentSource = "generated" | "attached";

export interface DocumentHistoryEntry {
  id: string;
  fileName: string;
  path: string;
  source: DocumentSource;
  createdAt: string;
  label?: string | null;
}

export interface DocumentInfo {
  exists: boolean;
  path?: string;
  generatedAt?: string;
  draftVersion?: number;
  history?: DocumentHistoryEntry[];
  activeHistoryId?: string | null;
}

export interface DocumentsMeta {
  ef: DocumentInfo;
  et: DocumentInfo;
  testesUnitarios: DocumentInfo;
}

export interface TicketMeta {
  schemaVersion: number;
  key: string;
  title: string;
  client: string;
  status: TicketStatus;
  priority: Priority;
  tags: string[];
  author: string;
  createdAt: string;
  updatedAt: string;
  jiraUrl?: string | null;
  estimativaHoras?: number | null;
  documents: DocumentsMeta;
}

export interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
  custom: boolean;
}

export interface Checklist {
  schemaVersion: number;
  items: ChecklistItem[];
}

export interface ClientSummary {
  name: string;
  ticketCount: number;
  path: string;
}

export interface TicketSummary {
  key: string;
  title: string;
  client: string;
  status: TicketStatus;
  priority: Priority;
  tags: string[];
  updatedAt: string;
  documents: DocumentsMeta;
  orphan: boolean;
  path: string;
}

export interface TicketDetail {
  meta: TicketMeta;
  path: string;
  notes: string;
  checklist: Checklist;
  orphan: boolean;
}

export interface WorkspaceTree {
  rootPath: string;
  clients: ClientSummary[];
  tickets: TicketSummary[];
}

export interface Attachment {
  fileName: string;
  path: string;
  size: number;
  modifiedAt?: string | null;
}

export interface SearchHit {
  client: string;
  key: string;
  title: string;
  status: TicketStatus;
  tags: string[];
  scoreHint: string;
}

export interface DraftPayload {
  docType: string;
  version: number;
  data: Record<string, unknown>;
  updatedAt: string;
}

export interface DraftPrint {
  id: string;
  fileName: string;
  caption?: string | null;
  createdAt: string;
}

export interface DraftPrintsPayload {
  schemaVersion: number;
  prints: DraftPrint[];
}

export interface GenerateResult {
  path: string;
  generatedAt: string;
}

export type TimeSource = "timer" | "manual";
export type TimerStatus = "running" | "paused";

export interface TimeEntry {
  id: string;
  startedAt: string;
  endedAt?: string | null;
  seconds: number;
  note: string;
  source: TimeSource;
}

export interface HoursSummary {
  entries: TimeEntry[];
  totalSeconds: number;
  todaySeconds: number;
  weekSeconds: number;
}

export interface ClientHoursRow {
  client: string;
  todaySeconds: number;
  weekSeconds: number;
}

export interface TicketHoursRow {
  client: string;
  key: string;
  title: string;
  todaySeconds: number;
  weekSeconds: number;
}

export interface WorkspaceHoursReport {
  todaySeconds: number;
  weekSeconds: number;
  byTicket: TicketHoursRow[];
  byClient: ClientHoursRow[];
}

export interface ActiveTimerView {
  client: string;
  key: string;
  title: string;
  entryId: string;
  sessionStartedAt: string;
  status: TimerStatus;
  elapsedSecs: number;
  note: string;
}

export interface AppError {
  code: string;
  message: string;
}

export type DocType = "ef" | "et" | "testes_unitarios";

export interface Snippet {
  id: string;
  title: string;
  body: string;
}

export interface SnippetsPayload {
  schemaVersion: number;
  snippets: Snippet[];
}

/** Statuses counted as "abertos" on the dashboard (excludes concluído/cancelado). */
export const OPEN_TICKET_STATUSES: TicketStatus[] = [
  "backlog",
  "em_andamento",
  "aguardando_cliente",
  "em_teste",
];

export function isOpenTicketStatus(status: TicketStatus): boolean {
  return OPEN_TICKET_STATUSES.includes(status);
}

export const STATUS_LABELS: Record<TicketStatus, string> = {
  backlog: "Backlog",
  em_andamento: "Em andamento",
  aguardando_cliente: "Aguardando cliente",
  em_teste: "Em teste",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  critica: "Crítica",
};
