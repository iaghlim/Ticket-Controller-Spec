import { invoke } from "@tauri-apps/api/core";
import type {
  AppConfig,
  Attachment,
  Checklist,
  ClientSummary,
  DocType,
  DraftPayload,
  DraftPrintsPayload,
  GenerateResult,
  SearchHit,
  Snippet,
  SnippetsPayload,
  TicketDetail,
  TicketStatus,
  Priority,
  WorkspaceTree,
  ActiveTimerView,
  HoursSummary,
  WorkspaceHoursReport,
} from "./types";

export function isAppError(e: unknown): e is { code: string; message: string } {
  return (
    typeof e === "object" &&
    e !== null &&
    "message" in e &&
    typeof (e as { message: unknown }).message === "string"
  );
}

export function errorMessage(e: unknown): string {
  if (isAppError(e)) return e.message;
  if (e instanceof Error) return e.message;
  if (typeof e === "string" && e.trim()) return e;
  if (typeof e === "object" && e !== null) {
    const rec = e as Record<string, unknown>;
    if (typeof rec.message === "string" && rec.message.trim()) return rec.message;
    if (typeof rec.error === "string" && rec.error.trim()) return rec.error;
    try {
      return JSON.stringify(e);
    } catch {
      /* ignore */
    }
  }
  return "Erro inesperado.";
}

export const api = {
  getConfig: () => invoke<AppConfig>("get_config"),
  setRootPath: (path: string) => invoke<AppConfig>("set_root_path", { path }),
  updateConfig: (payload: {
    authorDefault?: string;
    emptyPlaceholder?: string;
    theme?: string;
    cloudMode?: string;
    cloudApiUrl?: string;
    cloudToken?: string;
    cloudEmail?: string;
    cloudLastSyncAt?: string;
  }) =>
    invoke<AppConfig>("update_config", {
      authorDefault: payload.authorDefault ?? null,
      emptyPlaceholder: payload.emptyPlaceholder ?? null,
      theme: payload.theme ?? null,
      cloudMode: payload.cloudMode ?? null,
      cloudApiUrl: payload.cloudApiUrl ?? null,
      cloudToken: payload.cloudToken ?? null,
      cloudEmail: payload.cloudEmail ?? null,
      cloudLastSyncAt: payload.cloudLastSyncAt ?? null,
    }),
  scanWorkspace: () => invoke<WorkspaceTree>("scan_workspace_cmd"),
  openPath: (path: string) => invoke<void>("open_path", { path }),

  createClient: (name: string) => invoke<ClientSummary>("create_client", { name }),
  renameClient: (old: string, newName: string) =>
    invoke<ClientSummary>("rename_client", { old, newName }),
  deleteClient: (name: string, confirmName: string) =>
    invoke<void>("delete_client", { name, confirmName }),

  createTicket: (input: {
    client: string;
    key: string;
    title: string;
    author?: string;
    jiraUrl?: string;
    tags?: string[];
    priority?: Priority;
    status?: TicketStatus;
    estimativaHoras?: number;
  }) => invoke<TicketDetail>("create_ticket", { input }),
  applyCloudPull: (payload: {
    tickets: unknown[];
    comments: unknown[];
    timeEntries: unknown[];
  }) =>
    invoke<{
      ticketsCreated: number;
      ticketsUpdated: number;
      commentsAppended: number;
      timeEntriesMerged: number;
      skipped: string[];
    }>("apply_cloud_pull_cmd", { payload }),
  getTicket: (client: string, key: string) =>
    invoke<TicketDetail>("get_ticket", { client, key }),
  updateTicketMeta: (
    client: string,
    key: string,
    patch: Record<string, unknown>,
  ) => invoke<TicketDetail>("update_ticket_meta", { client, key, patch }),
  deleteTicket: (client: string, key: string, confirm: boolean) =>
    invoke<void>("delete_ticket", { client, key, confirm }),
  repairTicketMeta: (client: string, key: string, title?: string) =>
    invoke<TicketDetail>("repair_ticket_meta", {
      client,
      key,
      title: title ?? null,
    }),
  duplicateTicket: (
    client: string,
    key: string,
    newKey: string,
    includeAttachments?: boolean,
  ) =>
    invoke<TicketDetail>("duplicate_ticket", {
      client,
      key,
      newKey,
      includeAttachments: includeAttachments ?? false,
    }),

  getChecklist: (client: string, key: string) =>
    invoke<Checklist>("get_checklist", { client, key }),
  saveChecklist: (client: string, key: string, checklist: Checklist) =>
    invoke<Checklist>("save_checklist", { client, key, checklist }),

  readNotes: (client: string, key: string) =>
    invoke<string>("read_notes_cmd", { client, key }),
  writeNotes: (client: string, key: string, content: string) =>
    invoke<void>("write_notes_cmd", { client, key, content }),

  listAttachments: (client: string, key: string) =>
    invoke<Attachment[]>("list_attachments", { client, key }),
  addAttachment: (client: string, key: string, sourcePath: string) =>
    invoke<Attachment>("add_attachment", { client, key, sourcePath }),
  removeAttachment: (client: string, key: string, fileName: string) =>
    invoke<void>("remove_attachment", { client, key, fileName }),

  readDraft: (client: string, key: string, docType: DocType) =>
    invoke<DraftPayload>("read_draft", { client, key, docType }),
  saveDraft: (
    client: string,
    key: string,
    docType: DocType,
    data: Record<string, unknown>,
    version?: number,
  ) =>
    invoke<DraftPayload>("save_draft", {
      client,
      key,
      docType,
      data,
      version: version ?? null,
    }),
  listDraftPrints: (client: string, key: string, docType: DocType) =>
    invoke<DraftPrintsPayload>("list_draft_prints", { client, key, docType }),
  addDraftPrint: (
    client: string,
    key: string,
    docType: DocType,
    sourcePath: string,
    caption?: string,
  ) =>
    invoke<DraftPrintsPayload>("add_draft_print", {
      client,
      key,
      docType,
      sourcePath,
      caption: caption ?? null,
    }),
  addDraftPrintBytes: (
    client: string,
    key: string,
    docType: DocType,
    fileName: string,
    base64Data: string,
    caption?: string,
  ) =>
    invoke<DraftPrintsPayload>("add_draft_print_bytes", {
      client,
      key,
      docType,
      fileName,
      base64Data,
      caption: caption ?? null,
    }),
  removeDraftPrint: (
    client: string,
    key: string,
    docType: DocType,
    printId: string,
  ) =>
    invoke<DraftPrintsPayload>("remove_draft_print", {
      client,
      key,
      docType,
      printId,
    }),
  generateDocument: (client: string, key: string, docType: DocType) =>
    invoke<GenerateResult>("generate_document", {
      client,
      key,
      docType,
    }),
  /** Lê .docx (ou outro arquivo) sob a raiz do workspace → base64 (upload cloud). */
  readWorkspaceFileBase64: (path: string) =>
    invoke<string>("read_workspace_file_base64", { path }),
  attachDocument: (
    client: string,
    key: string,
    docType: DocType,
    sourcePath: string,
  ) =>
    invoke<TicketDetail>("attach_document", {
      client,
      key,
      docType,
      sourcePath,
    }),
  setActiveDocumentHistory: (
    client: string,
    key: string,
    docType: DocType,
    historyId: string,
  ) =>
    invoke<TicketDetail>("set_active_document_history", {
      client,
      key,
      docType,
      historyId,
    }),

  search: (query: string) => invoke<SearchHit[]>("search", { query }),

  getSnippets: () => invoke<SnippetsPayload>("get_snippets"),
  saveSnippets: (snippets: Snippet[]) =>
    invoke<SnippetsPayload>("save_snippets", { snippets }),
  exportTicketZip: (client: string, key: string, destPath: string) =>
    invoke<{ path: string }>("export_ticket_zip", { client, key, destPath }),
  importTicketZip: (zipPath: string, client: string) =>
    invoke<TicketDetail>("import_ticket_zip", { zipPath, client }),

  getActiveTimer: () => invoke<ActiveTimerView | null>("get_active_timer"),
  startTimer: (
    client: string,
    key: string,
    title?: string,
    switchConfirmed?: boolean,
  ) =>
    invoke<ActiveTimerView>("start_timer", {
      client,
      key,
      title: title ?? null,
      switchConfirmed: switchConfirmed ?? false,
    }),
  pauseTimer: () => invoke<ActiveTimerView>("pause_timer"),
  stopTimer: (note?: string) =>
    invoke<HoursSummary>("stop_timer", { note: note ?? null }),
  setTimerNote: (note: string) => invoke<ActiveTimerView>("set_timer_note", { note }),
  listHours: (client: string, key: string) =>
    invoke<HoursSummary>("list_hours", { client, key }),
  addManualEntry: (
    client: string,
    key: string,
    startedAt: string,
    seconds: number,
    note?: string,
  ) =>
    invoke<HoursSummary>("add_manual_entry", {
      client,
      key,
      startedAt,
      seconds,
      note: note ?? null,
    }),
  deleteHoursEntry: (client: string, key: string, entryId: string) =>
    invoke<HoursSummary>("delete_hours_entry", { client, key, entryId }),
  exportHoursCsv: (client: string, key: string, destPath: string) =>
    invoke<{ path: string }>("export_hours_csv", { client, key, destPath }),
  getWorkspaceHoursReport: () =>
    invoke<WorkspaceHoursReport>("get_workspace_hours_report"),
  exportWeekHoursCsv: (destPath: string) =>
    invoke<{ path: string }>("export_week_hours_csv", { destPath }),
  showTimerOverlay: () => invoke<void>("show_timer_overlay"),
  focusMainWindow: () => invoke<void>("focus_main_window"),
  closeTimerOverlay: () => invoke<void>("close_timer_overlay"),
  setTimerOverlayCompact: (compact: boolean) =>
    invoke<void>("set_timer_overlay_compact", { compact }),
};
