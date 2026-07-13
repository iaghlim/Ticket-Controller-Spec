import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { open, save } from "@tauri-apps/plugin-dialog";
import { api, errorMessage } from "../../shared/api";
import { useWorkspace } from "../../shared/workspace";
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  type Attachment,
  type Checklist,
  type DocType,
  type HoursSummary,
  type Priority,
  type TicketDetail,
  type TicketStatus,
} from "../../shared/types";
import { Modal, formatBytes, formatDate, useDebounced } from "../../shared/components/ui";
import { HoursPanel } from "../timer/HoursPanel";

function formatHours(hours: number): string {
  const rounded = Math.round(hours * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}h` : `${rounded.toFixed(1)}h`;
}

function secondsToHours(secs: number): number {
  return secs / 3600;
}

export function TicketDetailPage() {
  const { clientName = "", ticketKey = "" } = useParams();
  const client = decodeURIComponent(clientName);
  const key = decodeURIComponent(ticketKey);
  const navigate = useNavigate();
  const { refresh } = useWorkspace();

  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const debouncedNotes = useDebounced(notes, 500);
  const [tagsText, setTagsText] = useState("");
  const [dupOpen, setDupOpen] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [includeAtt, setIncludeAtt] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [hours, setHours] = useState<HoursSummary | null>(null);

  const loadHours = useCallback(async () => {
    try {
      setHours(await api.listHours(client, key));
    } catch {
      setHours(null);
    }
  }, [client, key]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const d = await api.getTicket(client, key);
      setDetail(d);
      setNotes(d.notes);
      setTagsText(d.meta.tags.join(", "));
      const atts = await api.listAttachments(client, key);
      setAttachments(atts);
      await loadHours();
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [client, key, loadHours]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const refreshHours = () => void loadHours();
    const onVisibility = () => {
      if (document.visibilityState === "visible") refreshHours();
    };
    window.addEventListener("focus", refreshHours);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", refreshHours);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [loadHours]);

  useEffect(() => {
    if (!detail) return;
    if (debouncedNotes === detail.notes) return;
    void (async () => {
      try {
        await api.writeNotes(client, key, debouncedNotes);
      } catch (e) {
        setError(errorMessage(e));
      }
    })();
  }, [debouncedNotes, client, key, detail]);

  async function patch(p: Record<string, unknown>) {
    setError(null);
    try {
      const d = await api.updateTicketMeta(client, key, p);
      setDetail(d);
      setTagsText(d.meta.tags.join(", "));
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function saveChecklist(checklist: Checklist) {
    try {
      const cl = await api.saveChecklist(client, key, checklist);
      setDetail((d) => (d ? { ...d, checklist: cl } : d));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function addAttachment() {
    try {
      const selected = await open({
        multiple: false,
        title: "Adicionar anexo",
      });
      if (!selected || Array.isArray(selected)) return;
      await api.addAttachment(client, key, selected);
      setAttachments(await api.listAttachments(client, key));
      setMsg("Anexo adicionado.");
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function removeAttachment(fileName: string) {
    if (!confirm(`Remover anexo "${fileName}"?`)) return;
    try {
      await api.removeAttachment(client, key, fileName);
      setAttachments(await api.listAttachments(client, key));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function attachDocument(docType: DocType) {
    try {
      const selected = await open({
        multiple: false,
        title: "Anexar documento existente",
        filters: [
          {
            name: "Documentos Office",
            extensions: ["docx", "doc", "odt", "rtf"],
          },
        ],
      });
      if (!selected || Array.isArray(selected)) return;
      const d = await api.attachDocument(client, key, docType, selected);
      setDetail(d);
      setMsg("Documento anexado ao histórico.");
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function setActiveDocVersion(docType: DocType, historyId: string) {
    try {
      const d = await api.setActiveDocumentHistory(client, key, docType, historyId);
      setDetail(d);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function openActiveDoc(docType: DocType) {
    if (!detail) return;
    const info =
      docType === "ef"
        ? detail.meta.documents.ef
        : docType === "et"
          ? detail.meta.documents.et
          : detail.meta.documents.testesUnitarios;
    const history = info.history ?? [];
    const activeId = info.activeHistoryId;
    const entry =
      history.find((h) => h.id === activeId) ?? history[history.length - 1];
    if (!entry) {
      setError("Nenhuma versão selecionada para abrir.");
      return;
    }
    try {
      await api.openPath(`${detail.path}\\${entry.path.replace(/\//g, "\\")}`);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function exportZip() {
    try {
      const dest = await save({
        defaultPath: `${key}.zip`,
        filters: [{ name: "ZIP", extensions: ["zip"] }],
      });
      if (!dest) return;
      const res = await api.exportTicketZip(client, key, dest);
      setMsg(`Exportado: ${res.path}`);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function duplicate() {
    try {
      const d = await api.duplicateTicket(client, key, newKey.trim().toUpperCase(), includeAtt);
      setDupOpen(false);
      await refresh();
      navigate(
        `/chamados/${encodeURIComponent(d.meta.client)}/${encodeURIComponent(d.meta.key)}`,
      );
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function repair() {
    try {
      await api.repairTicketMeta(client, key, detail?.meta.title);
      setMsg("Meta reparada.");
      await load();
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  if (!detail && !error) {
    return <div className="muted">Carregando…</div>;
  }
  if (!detail) {
    return <div className="error-banner">{error}</div>;
  }

  const m = detail.meta;
  const actualHours = secondsToHours(hours?.totalSeconds ?? 0);
  const estimate = m.estimativaHoras;
  const overEstimate =
    estimate != null && estimate > 0 && actualHours > estimate + 0.01;
  const deltaHours =
    estimate != null ? Math.round((actualHours - estimate) * 10) / 10 : 0;
  const docs: { type: DocType; label: string; info: typeof m.documents.ef; path?: string }[] = [
    { type: "ef", label: "EF — Especificação Funcional", info: m.documents.ef },
    { type: "et", label: "ET — Especificação Técnica", info: m.documents.et },
    {
      type: "testes_unitarios",
      label: "TU — Testes Unitários",
      info: m.documents.testesUnitarios,
    },
  ];

  return (
    <div className="stack">
      <div>
        <p className="page-sub" style={{ marginBottom: 0 }}>
          <Link to={`/clientes/${encodeURIComponent(client)}`}>{client}</Link>
        </p>
        <h1 className="page-title">
          <span className="key-link">{m.key}</span>
        </h1>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {msg && <div className="success-banner">{msg}</div>}
      {detail.orphan && (
        <div className="error-banner row" style={{ justifyContent: "space-between" }}>
          <span>Pasta órfã (sem meta.json válido).</span>
          <button className="btn" onClick={() => void repair()}>
            Reparar meta
          </button>
        </div>
      )}

      <div className="panel stack">
        <div className="field">
          <label>Título</label>
          <input
            value={m.title}
            onChange={(e) => setDetail({ ...detail, meta: { ...m, title: e.target.value } })}
            onBlur={() => void patch({ title: m.title })}
          />
        </div>
        <div className="grid-3">
          <div className="field">
            <label>Status</label>
            <select
              value={m.status}
              onChange={(e) => void patch({ status: e.target.value as TicketStatus })}
            >
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Prioridade</label>
            <select
              value={m.priority}
              onChange={(e) => void patch({ priority: e.target.value as Priority })}
            >
              {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Autor</label>
            <input
              value={m.author}
              onChange={(e) => setDetail({ ...detail, meta: { ...m, author: e.target.value } })}
              onBlur={() => void patch({ author: m.author })}
            />
          </div>
        </div>
        <div className="field">
          <label>Tags (vírgula)</label>
          <input
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            onBlur={() =>
              void patch({
                tags: tagsText
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean),
              })
            }
          />
        </div>
        <div className="field">
          <label>Estimativa (horas)</label>
          <input
            type="number"
            min="0"
            step="0.5"
            placeholder="Opcional"
            value={m.estimativaHoras ?? ""}
            onChange={(e) => {
              const raw = e.target.value;
              const val = raw === "" ? undefined : Number(raw);
              setDetail({
                ...detail,
                meta: { ...m, estimativaHoras: Number.isFinite(val) ? val : undefined },
              });
            }}
            onBlur={() => {
              const est = m.estimativaHoras;
              void patch({
                estimativaHoras:
                  est != null && Number.isFinite(est) && est >= 0 ? est : null,
              });
            }}
          />
        </div>
        {estimate != null && estimate > 0 && (
          <div
            className={`hours-compare${overEstimate ? " hours-compare--over" : ""}`}
          >
            <span>
              <span className="muted">Estimado</span>{" "}
              <strong>{formatHours(estimate)}</strong>
            </span>
            <span className="muted">·</span>
            <span>
              <span className="muted">Real</span>{" "}
              <strong>{formatHours(actualHours)}</strong>
            </span>
            {overEstimate && (
              <span className="badge warn">+{formatHours(deltaHours)} acima</span>
            )}
            {!overEstimate && actualHours > 0 && estimate >= actualHours && (
              <span className="badge ok">dentro da estimativa</span>
            )}
          </div>
        )}
        <div className="field">
          <label>URL Jira (texto/link local — sem integração)</label>
          <input
            value={m.jiraUrl ?? ""}
            onChange={(e) =>
              setDetail({ ...detail, meta: { ...m, jiraUrl: e.target.value } })
            }
            onBlur={() => void patch({ jiraUrl: m.jiraUrl || null })}
          />
          {m.jiraUrl && (
            <a href={m.jiraUrl} target="_blank" rel="noreferrer">
              Abrir link
            </a>
          )}
        </div>
        <div className="muted">
          Criado {formatDate(m.createdAt)} · Atualizado {formatDate(m.updatedAt)}
        </div>
      </div>

      <div className="row">
        <button className="btn" onClick={() => void api.openPath(detail.path)}>
          Abrir pasta
        </button>
        <button
          className="btn btn-primary"
          onClick={async () => {
            try {
              await api.showTimerOverlay();
              try {
                await api.startTimer(client, key, m.title, false);
              } catch (e) {
                const message = errorMessage(e);
                if (message.includes("Já existe") || message.includes("Confirme")) {
                  if (confirm(`${message}\n\nFinalizar o anterior e iniciar aqui?`)) {
                    await api.startTimer(client, key, m.title, true);
                  }
                } else {
                  throw e;
                }
              }
              setMsg("Overlay do timer aberto.");
            } catch (e) {
              setError(errorMessage(e));
            }
          }}
        >
          Timer
        </button>
        <button className="btn" onClick={() => setDupOpen(true)}>
          Duplicar
        </button>
        <button className="btn" onClick={() => void exportZip()}>
          Exportar ZIP
        </button>
        <button className="btn btn-danger" onClick={() => setDeleteOpen(true)}>
          Excluir
        </button>
      </div>

      <HoursPanel client={client} keyName={key} />

      <div className="panel">
        <h3>Documentos</h3>
        <div className="grid-3">
          {docs.map((d) => {
            const history = [...(d.info.history ?? [])].reverse();
            const hasHistory = history.length > 0;
            const activeId =
              d.info.activeHistoryId ?? history[0]?.id ?? null;
            return (
              <div key={d.type} className="panel doc-card">
                <strong>{d.label}</strong>
                {!hasHistory ? (
                  <span className="badge warn">Não gerado</span>
                ) : (
                  <ul className="doc-history-list">
                    {history.map((h) => {
                      const sourceLabel =
                        h.source === "attached" ? "Anexado" : "Gerado";
                      return (
                        <li key={h.id} className="doc-history-item">
                          <label>
                            <input
                              type="radio"
                              name={`doc-active-${d.type}`}
                              checked={activeId === h.id}
                              onChange={() =>
                                void setActiveDocVersion(d.type, h.id)
                              }
                            />
                            <span>
                              {sourceLabel} - {h.fileName} -{" "}
                              {formatDate(h.createdAt)}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div className="row" style={{ flexWrap: "wrap" }}>
                  <Link
                    className="btn btn-primary"
                    to={`/chamados/${encodeURIComponent(client)}/${encodeURIComponent(key)}/docs/${d.type}`}
                  >
                    Preencher / Gerar
                  </Link>
                  {d.info.draftVersion != null && (
                    <Link
                      className="btn"
                      to={`/chamados/${encodeURIComponent(client)}/${encodeURIComponent(key)}/docs/${d.type}`}
                    >
                      Editar draft
                    </Link>
                  )}
                  <button
                    className="btn"
                    type="button"
                    onClick={() => void attachDocument(d.type)}
                  >
                    Anexar
                  </button>
                  <button
                    className="btn"
                    type="button"
                    disabled={!hasHistory}
                    onClick={() => void openActiveDoc(d.type)}
                  >
                    Abrir .docx
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="panel">
        <h3>Checklist</h3>
        {detail.checklist.items.map((item, idx) => (
          <label key={item.id} className="checklist-item">
            <input
              type="checkbox"
              checked={item.done}
              onChange={() => {
                const items = detail.checklist.items.map((it, i) =>
                  i === idx ? { ...it, done: !it.done } : it,
                );
                void saveChecklist({ ...detail.checklist, items });
              }}
            />
            <span style={{ flex: 1 }}>{item.label}</span>
            {item.custom && (
              <button
                className="btn btn-danger"
                onClick={() => {
                  const items = detail.checklist.items.filter((_, i) => i !== idx);
                  void saveChecklist({ ...detail.checklist, items });
                }}
              >
                Remover
              </button>
            )}
          </label>
        ))}
        <button
          className="btn"
          onClick={() => {
            const label = prompt("Novo item do checklist:");
            if (!label?.trim()) return;
            const items = [
              ...detail.checklist.items,
              {
                id: `custom-${Date.now()}`,
                label: label.trim(),
                done: false,
                custom: true,
              },
            ];
            void saveChecklist({ ...detail.checklist, items });
          }}
        >
          Adicionar item
        </button>
      </div>

      <div className="panel stack">
        <h3>Notas</h3>
        <div className="field">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anotações em Markdown…"
            style={{ minHeight: 160 }}
          />
        </div>
        <span className="muted">Salva automaticamente (500ms).</span>
      </div>

      <div className="panel stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3 style={{ margin: 0 }}>Anexos</h3>
          <button className="btn" onClick={() => void addAttachment()}>
            Adicionar…
          </button>
        </div>
        {attachments.length === 0 ? (
          <div className="empty">Nenhum anexo.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Arquivo</th>
                <th>Tamanho</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {attachments.map((a) => (
                <tr key={a.fileName}>
                  <td>{a.fileName}</td>
                  <td>{formatBytes(a.size)}</td>
                  <td className="row">
                    <button className="btn" onClick={() => void api.openPath(a.path)}>
                      Abrir
                    </button>
                    <button
                      className="btn btn-danger"
                      onClick={() => void removeAttachment(a.fileName)}
                    >
                      Remover
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={dupOpen} title="Duplicar chamado" onClose={() => setDupOpen(false)}>
        <div className="stack">
          <div className="field">
            <label>Nova chave</label>
            <input
              className="mono"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
            />
          </div>
          <label className="checklist-item">
            <input
              type="checkbox"
              checked={includeAtt}
              onChange={(e) => setIncludeAtt(e.target.checked)}
            />
            Incluir anexos
          </label>
          <p className="muted">Copia drafts, notas e checklist. Não copia .docx gerados.</p>
          <div className="row">
            <button className="btn btn-primary" onClick={() => void duplicate()}>
              Duplicar
            </button>
            <button className="btn" onClick={() => setDupOpen(false)}>
              Cancelar
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={deleteOpen} title="Excluir chamado" onClose={() => setDeleteOpen(false)}>
        <div className="stack">
          <p>
            Excluir <strong>{key}</strong> e todos os arquivos da pasta?
          </p>
          <div className="row">
            <button
              className="btn btn-danger"
              onClick={async () => {
                try {
                  await api.deleteTicket(client, key, true);
                  await refresh();
                  navigate(`/clientes/${encodeURIComponent(client)}`);
                } catch (e) {
                  setError(errorMessage(e));
                }
              }}
            >
              Excluir
            </button>
            <button className="btn" onClick={() => setDeleteOpen(false)}>
              Cancelar
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
