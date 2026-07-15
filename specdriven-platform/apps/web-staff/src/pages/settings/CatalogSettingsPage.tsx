import { useCallback, useEffect, useState, type FormEvent } from "react";
import { TICKET_TYPES, type TicketType } from "@specdriven/shared";
import {
  ApiError,
  createModule,
  deleteModule,
  getSettings,
  listModules,
  patchModule,
  patchPortalSettings,
  type TicketModuleCatalogItem,
} from "../../lib/api";
import { ticketTypeLabel } from "../../lib/labels";
import { TagsSection } from "../TagsPage";

type Tab = "portal" | "tags" | "offerings";

export interface ServiceOffering {
  id: string;
  name: string;
  active: boolean;
  updatedAt: string;
}

const MODULE_KEY_PATTERN = /^[a-z][a-z0-9_]{1,31}$/;

const DEFAULT_OFFERINGS: ServiceOffering[] = [
  { id: "offering-1", name: "Suporte Nível 1 - 8x5", active: true, updatedAt: new Date().toISOString() },
  { id: "offering-2", name: "Suporte Premium - 24x7", active: true, updatedAt: new Date().toISOString() },
  { id: "offering-3", name: "Consultoria Técnica Especializada", active: true, updatedAt: new Date().toISOString() },
];

export function CatalogSettingsPage() {
  const [tab, setTab] = useState<Tab>("portal");
  const [canEdit, setCanEdit] = useState(false);
  const [enabledTypes, setEnabledTypes] = useState<TicketType[]>([...TICKET_TYPES]);
  const [modules, setModules] = useState<TicketModuleCatalogItem[]>([]);
  const [moduleKey, setModuleKey] = useState("");
  const [moduleLabel, setModuleLabel] = useState("");
  const [editingModuleId, setEditingModuleId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingTypes, setSavingTypes] = useState(false);
  const [savingModule, setSavingModule] = useState(false);
  const [deletingModuleId, setDeletingModuleId] = useState<string | null>(null);

  // Service Offerings states
  const [offerings, setOfferings] = useState<ServiceOffering[]>([]);
  const [showOfferingForm, setShowOfferingForm] = useState(false);
  const [editingOfferingId, setEditingOfferingId] = useState<string | null>(null);
  const [offeringName, setOfferingName] = useState("");
  const [offeringActive, setOfferingActive] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [settingsRes, modulesRes] = await Promise.all([
        getSettings(),
        listModules(),
      ]);
      setCanEdit(settingsRes.canEdit);
      setEnabledTypes(settingsRes.settings.enabledTicketTypes ?? [...TICKET_TYPES]);
      setModules(modulesRes.modules);

      // Load offerings from localStorage
      const savedOffs = localStorage.getItem("specdriven.service_offerings");
      if (savedOffs) {
        try {
          setOfferings(JSON.parse(savedOffs));
        } catch (err) {
          setOfferings(DEFAULT_OFFERINGS);
          localStorage.setItem("specdriven.service_offerings", JSON.stringify(DEFAULT_OFFERINGS));
        }
      } else {
        setOfferings(DEFAULT_OFFERINGS);
        localStorage.setItem("specdriven.service_offerings", JSON.stringify(DEFAULT_OFFERINGS));
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Não foi possível carregar o catálogo.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function saveOfferingsToLocalStorage(updatedList: ServiceOffering[]) {
    setOfferings(updatedList);
    localStorage.setItem("specdriven.service_offerings", JSON.stringify(updatedList));
  }

  function handleSaveOffering(e: FormEvent) {
    e.preventDefault();
    if (!offeringName.trim()) return;

    let updatedList: ServiceOffering[];
    if (editingOfferingId) {
      updatedList = offerings.map((o) =>
        o.id === editingOfferingId
          ? { ...o, name: offeringName.trim(), active: offeringActive, updatedAt: new Date().toISOString() }
          : o
      );
      setOk("Oferta de serviço atualizada com sucesso.");
    } else {
      const newOff: ServiceOffering = {
        id: `offering-${Date.now()}`,
        name: offeringName.trim(),
        active: offeringActive,
        updatedAt: new Date().toISOString(),
      };
      updatedList = [...offerings, newOff];
      setOk("Oferta de serviço criada com sucesso.");
    }
    saveOfferingsToLocalStorage(updatedList);
    resetOfferingForm();
  }

  function handleEditOffering(offering: ServiceOffering) {
    setEditingOfferingId(offering.id);
    setOfferingName(offering.name);
    setOfferingActive(offering.active);
    setShowOfferingForm(true);
    setError(null);
    setOk(null);
  }

  function handleDeleteOffering(id: string) {
    if (!window.confirm("Deseja realmente excluir/retirar esta oferta de serviço?")) return;
    const updatedList = offerings.filter((o) => o.id !== id);
    saveOfferingsToLocalStorage(updatedList);
    setOk("Oferta de serviço excluída.");
    if (editingOfferingId === id) {
      resetOfferingForm();
    }
  }

  function resetOfferingForm() {
    setEditingOfferingId(null);
    setOfferingName("");
    setOfferingActive(true);
    setShowOfferingForm(false);
  }

  function toggleType(type: TicketType) {
    if (!canEdit) return;
    setEnabledTypes((prev) => {
      if (prev.includes(type)) {
        if (prev.length <= 1) return prev;
        return prev.filter((t) => t !== type);
      }
      return [...prev, type];
    });
    setOk(null);
  }

  async function saveTypes() {
    if (!canEdit) return;
    setSavingTypes(true);
    setError(null);
    setOk(null);
    try {
      const res = await patchPortalSettings({ enabledTicketTypes: enabledTypes });
      setEnabledTypes(res.settings.enabledTicketTypes ?? [...TICKET_TYPES]);
      setOk("Tipos de chamado atualizados.");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Falha ao salvar tipos.",
      );
    } finally {
      setSavingTypes(false);
    }
  }

  function startEditModule(mod: TicketModuleCatalogItem) {
    if (!canEdit) return;
    setEditingModuleId(mod.id);
    setModuleKey(mod.key);
    setModuleLabel(mod.label);
    setOk(null);
    setError(null);
  }

  function cancelEditModule() {
    setEditingModuleId(null);
    setModuleKey("");
    setModuleLabel("");
  }

  async function onModuleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    const label = moduleLabel.trim();
    if (!label) return;

    setSavingModule(true);
    setError(null);
    setOk(null);
    try {
      if (editingModuleId) {
        const { module } = await patchModule(editingModuleId, { label });
        setModules((prev) =>
          prev
            .map((m) => (m.id === module.id ? module : m))
            .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label)),
        );
        setOk("Módulo atualizado.");
      } else {
        const key = moduleKey.trim().toLowerCase();
        if (!MODULE_KEY_PATTERN.test(key)) {
          setError(
            "Chave inválida. Use minúsculas, 2–32 caracteres (a-z, 0-9, _).",
          );
          return;
        }
        const { module } = await createModule({ key, label });
        setModules((prev) =>
          [...prev, module].sort(
            (a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label),
          ),
        );
        setOk("Módulo criado.");
      }
      cancelEditModule();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao salvar módulo.");
    } finally {
      setSavingModule(false);
    }
  }

  async function toggleModuleEnabled(mod: TicketModuleCatalogItem) {
    if (!canEdit) return;
    setError(null);
    setOk(null);
    try {
      const { module } = await patchModule(mod.id, { enabled: !mod.enabled });
      setModules((prev) =>
        prev.map((m) => (m.id === module.id ? module : m)),
      );
      setOk(module.enabled ? "Módulo ativado." : "Módulo desativado.");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Falha ao alterar módulo.",
      );
    }
  }

  async function onDeleteModule(id: string) {
    if (!canEdit) return;
    if (!window.confirm("Excluir este módulo do catálogo?")) return;
    setDeletingModuleId(id);
    setError(null);
    setOk(null);
    try {
      await deleteModule(id);
      setModules((prev) => prev.filter((m) => m.id !== id));
      if (editingModuleId === id) cancelEditModule();
      setOk("Módulo excluído.");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Falha ao excluir módulo.",
      );
    } finally {
      setDeletingModuleId(null);
    }
  }

  if (loading) {
    return <p className="muted">Carregando catálogo…</p>;
  }

  return (
    <div>
      <div className="panel-head">
        <h2>Catálogo do portal</h2>
        <p>
          Tipos de chamado e módulos visíveis ao cliente na abertura de chamados.
          {!canEdit ? (
            <span className="muted">
              {" "}
              Modo leitura — apenas gestor ou admin pode editar.
            </span>
          ) : null}
        </p>
      </div>

      <div className="catalog-tabs" role="tablist" aria-label="Seções do catálogo">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "portal"}
          className={`catalog-tab${tab === "portal" ? " active" : ""}`}
          onClick={() => setTab("portal")}
        >
          Portal cliente
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "tags"}
          className={`catalog-tab${tab === "tags" ? " active" : ""}`}
          onClick={() => setTab("tags")}
        >
          Tags
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "offerings"}
          className={`catalog-tab${tab === "offerings" ? " active" : ""}`}
          onClick={() => setTab("offerings")}
        >
          Service Offerings
        </button>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {ok ? <p className="ok-banner">{ok}</p> : null}

      {tab === "portal" && (
        <>
          <div className="panel">
            <h3 style={{ marginTop: 0 }}>Tipos de chamado habilitados</h3>
            <p className="muted">
              Pelo menos um tipo deve permanecer ativo. Define o grid da home e o
              formulário de abertura no portal cliente.
            </p>
            <ul className="catalog-type-checklist">
              {TICKET_TYPES.map((type) => (
                <li key={type}>
                  <label className="catalog-type-item">
                    <input
                      type="checkbox"
                      checked={enabledTypes.includes(type)}
                      disabled={!canEdit}
                      onChange={() => toggleType(type)}
                    />
                    <span>{ticketTypeLabel(type)}</span>
                  </label>
                </li>
              ))}
            </ul>
            {canEdit ? (
              <div className="form-actions">
                <button
                  type="button"
                  className="btn"
                  disabled={savingTypes}
                  onClick={() => void saveTypes()}
                >
                  {savingTypes ? "Salvando…" : "Salvar tipos"}
                </button>
              </div>
            ) : null}
          </div>

          <div className="panel">
            <h3 style={{ marginTop: 0 }}>
              {editingModuleId ? "Editar módulo" : "Novo módulo"}
            </h3>
            <p className="muted">
              Áreas do sistema exibidas no select de abertura (ex.: Financeiro, RH).
            </p>
            {canEdit ? (
              <form className="form" onSubmit={onModuleSubmit}>
                {!editingModuleId ? (
                  <div className="field">
                    <label htmlFor="moduleKey">Chave</label>
                    <input
                      id="moduleKey"
                      value={moduleKey}
                      onChange={(e) => setModuleKey(e.target.value)}
                      required
                      pattern="[a-z][a-z0-9_]{1,31}"
                      placeholder="financeiro"
                      title="Minúsculas, 2–32 chars (a-z, 0-9, _)"
                    />
                  </div>
                ) : (
                  <div className="field">
                    <label>Chave</label>
                    <input value={moduleKey} disabled className="mono" />
                  </div>
                )}
                <div className="field">
                  <label htmlFor="moduleLabel">Rótulo</label>
                  <input
                    id="moduleLabel"
                    value={moduleLabel}
                    onChange={(e) => setModuleLabel(e.target.value)}
                    required
                    maxLength={80}
                    placeholder="Financeiro"
                  />
                </div>
                <div className="form-actions">
                  <button className="btn" type="submit" disabled={savingModule}>
                    {savingModule
                      ? "Salvando…"
                      : editingModuleId
                        ? "Atualizar"
                        : "Criar"}
                  </button>
                  {editingModuleId ? (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={cancelEditModule}
                    >
                      Cancelar
                    </button>
                  ) : null}
                </div>
              </form>
            ) : null}
          </div>

          <div className="panel" style={{ padding: 0 }}>
            <div className="panel-section-head">
              <div>
                <h3>Módulos do catálogo</h3>
                <p>{modules.length} módulo(s) cadastrado(s)</p>
              </div>
            </div>
            {modules.length === 0 ? (
              <p className="empty">Nenhum módulo cadastrado.</p>
            ) : (
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Rótulo</th>
                      <th>Chave</th>
                      <th>Ordem</th>
                      <th>Status</th>
                      {canEdit ? <th /> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {modules.map((mod) => (
                      <tr key={mod.id}>
                        <td>{mod.label}</td>
                        <td className="table-meta mono">{mod.key}</td>
                        <td className="table-meta">{mod.sortOrder}</td>
                        <td>
                          <span
                            className={`settings-status-pill${mod.enabled ? " ok" : " warn"}`}
                          >
                            {mod.enabled ? "Ativo" : "Inativo"}
                          </span>
                        </td>
                        {canEdit ? (
                          <td>
                            <div className="table-actions">
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={() => startEditModule(mod)}
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={() => void toggleModuleEnabled(mod)}
                              >
                                {mod.enabled ? "Desativar" : "Ativar"}
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                disabled={deletingModuleId === mod.id}
                                onClick={() => void onDeleteModule(mod.id)}
                              >
                                {deletingModuleId === mod.id ? "…" : "Excluir"}
                              </button>
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {tab === "tags" && (
        <TagsSection readOnly={!canEdit} />
      )}

      {tab === "offerings" && (
        <>
          {canEdit && (
            <div className="panel" style={{ marginBottom: "1.5rem" }}>
              <h3 style={{ marginTop: 0 }}>
                {editingOfferingId ? "Editar Oferta de Serviço" : "Nova Oferta de Serviço"}
              </h3>
              <p className="muted">Defina as ofertas de serviços disponíveis para vinculação em chamados.</p>
              <form onSubmit={handleSaveOffering} className="form form-spaced">
                <div className="field">
                  <label htmlFor="off-name">Nome da Oferta *</label>
                  <input
                    id="off-name"
                    type="text"
                    required
                    value={offeringName}
                    onChange={(e) => setOfferingName(e.target.value)}
                    placeholder="Ex: Suporte Premium 24x7"
                  />
                </div>
                <div className="field" style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem" }}>
                  <input
                    id="off-active"
                    type="checkbox"
                    checked={offeringActive}
                    onChange={(e) => setOfferingActive(e.target.checked)}
                  />
                  <label htmlFor="off-active" style={{ marginBottom: 0, cursor: "pointer" }}>
                    Ativo (Disponível para seleção)
                  </label>
                </div>
                <div className="form-actions">
                  <button className="btn" type="submit">
                    {editingOfferingId ? "Atualizar" : "Criar"}
                  </button>
                  {(editingOfferingId || showOfferingForm) && (
                    <button type="button" className="btn btn-ghost" onClick={resetOfferingForm}>
                      Cancelar
                    </button>
                  )}
                </div>
              </form>
            </div>
          )}

          <div className="panel" style={{ padding: 0 }}>
            <div className="panel-section-head">
              <div>
                <h3>Ofertas de Serviço</h3>
                <p>{offerings.length} oferta(s) cadastrada(s)</p>
              </div>
            </div>
            {offerings.length === 0 ? (
              <p className="empty">Nenhuma oferta de serviço cadastrada.</p>
            ) : (
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Nome da Oferta</th>
                      <th>Status</th>
                      <th>Última Atualização</th>
                      {canEdit ? <th style={{ width: "200px" }} /> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {offerings.map((off) => (
                      <tr key={off.id}>
                        <td style={{ fontWeight: 600 }}>{off.name}</td>
                        <td>
                          <span className={`settings-status-pill${off.active ? " ok" : " warn"}`}>
                            {off.active ? "Ativo" : "Inativo"}
                          </span>
                        </td>
                        <td className="table-meta">
                          {new Date(off.updatedAt).toLocaleString("pt-BR")}
                        </td>
                        {canEdit ? (
                          <td>
                            <div className="table-actions">
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={() => handleEditOffering(off)}
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                style={{ color: "red" }}
                                onClick={() => handleDeleteOffering(off.id)}
                              >
                                Excluir/Retirar
                              </button>
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
