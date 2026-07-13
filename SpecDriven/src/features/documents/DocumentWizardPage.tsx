import { useEffect, useMemo, useRef, useState } from "react";

import { Link, useParams } from "react-router-dom";

import { api, errorMessage } from "../../shared/api";

import { cloudUploadDocx, defaultCloudConfig } from "../../shared/cloud";

import { useWorkspace } from "../../shared/workspace";

import type { DocType } from "../../shared/types";

import { SnippetsPanel } from "./SnippetsPanel";
import { DraftPrintsPanel } from "./DraftPrintsPanel";



type FieldDef = { key: string; label: string; required?: boolean; multiline?: boolean };



const COMMON: FieldDef[] = [

  { key: "cliente", label: "Cliente", required: true },

  { key: "chave", label: "Chave", required: true },

  { key: "titulo", label: "Título", required: true },

  { key: "autor", label: "Autor", required: true },

  { key: "data", label: "Data", required: true },

  { key: "versao", label: "Versão", required: true },

  { key: "jira_url", label: "URL Jira" },

];



const EF_FIELDS: FieldDef[] = [
  { key: "objetivo", label: "Objetivo", required: true, multiline: true },
  { key: "escopo", label: "Escopo", required: true, multiline: true },
  { key: "regras_negocio", label: "Regras de negócio", required: true, multiline: true },
];

const ET_FIELDS: FieldDef[] = [
  { key: "resumo_solucao", label: "Resumo da solução", required: true, multiline: true },
  { key: "arquitetura", label: "Arquitetura", required: true, multiline: true },
  { key: "componentes", label: "Componentes impactados", required: true, multiline: true },
  { key: "modelo_dados", label: "Modelo de dados", multiline: true },
  { key: "endpoints", label: "Endpoints", multiline: true },
  { key: "rollback", label: "Rollback", multiline: true },
  { key: "dependencias", label: "Dependências", multiline: true },
];

const TU_FIELDS: FieldDef[] = [
  { key: "objetivo_testes", label: "Objetivo dos testes", required: true, multiline: true },
  { key: "cenarios", label: "Cenários", required: true, multiline: true },
  { key: "cobertura", label: "Cobertura esperada", multiline: true },
  { key: "evidencias", label: "Evidências", multiline: true },
];



const LABELS: Record<DocType, string> = {

  ef: "Especificação Funcional (EF)",

  et: "Especificação Técnica (ET)",

  testes_unitarios: "Testes Unitários (TU)",

};



function todayBr() {

  return new Date().toLocaleDateString("pt-BR");

}



function insertText(current: string, text: string, el?: HTMLTextAreaElement | null) {

  if (!el) {

    if (!current) return text;

    return `${current}\n\n${text}`;

  }

  const start = el.selectionStart ?? current.length;

  const end = el.selectionEnd ?? start;

  const inserted = current.slice(0, start) + text + current.slice(end);

  const cursor = start + text.length;

  queueMicrotask(() => {

    el.focus();

    el.setSelectionRange(cursor, cursor);

  });

  return inserted;

}



export function DocumentWizardPage() {

  const { clientName = "", ticketKey = "", docType = "ef" } = useParams();

  const client = decodeURIComponent(clientName);

  const key = decodeURIComponent(ticketKey);

  const dtype = (docType === "et" || docType === "testes_unitarios" ? docType : "ef") as DocType;

  const { config } = useWorkspace();



  const fields = useMemo(() => {

    const specific =

      dtype === "ef" ? EF_FIELDS : dtype === "et" ? ET_FIELDS : TU_FIELDS;

    return [...COMMON, ...specific];

  }, [dtype]);



  const multilineFields = useMemo(

    () => fields.filter((f) => f.multiline),

    [fields],

  );



  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});



  const [data, setData] = useState<Record<string, string>>({});

  const [version, setVersion] = useState(1);

  const [error, setError] = useState<string | null>(null);

  const [msg, setMsg] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);

  const [focusedField, setFocusedField] = useState<string | null>(null);

  const [hasExistingDoc, setHasExistingDoc] = useState(false);

  const [draftReady, setDraftReady] = useState(false);

  const [autoSaveStatus, setAutoSaveStatus] = useState<string | null>(null);

  const dataRef = useRef(data);

  const versionRef = useRef(version);

  const busyRef = useRef(busy);

  const saveInFlightRef = useRef(false);

  const pendingAutoSaveRef = useRef(false);

  const skipAutoSaveRef = useRef(true);



  dataRef.current = data;

  versionRef.current = version;

  busyRef.current = busy;



  useEffect(() => {

    setDraftReady(false);

    skipAutoSaveRef.current = true;

    setAutoSaveStatus(null);

    void (async () => {

      try {

        const ticket = await api.getTicket(client, key);

        const draft = await api.readDraft(client, key, dtype);

        const docInfo =
          dtype === "ef"
            ? ticket.meta.documents.ef
            : dtype === "et"
              ? ticket.meta.documents.et
              : ticket.meta.documents.testesUnitarios;
        setHasExistingDoc(
          Boolean(docInfo.exists || (docInfo.history && docInfo.history.length > 0)),
        );

        const base: Record<string, string> = {

          cliente: ticket.meta.client,

          chave: ticket.meta.key,

          titulo: ticket.meta.title,

          autor: ticket.meta.author || config?.authorDefault || "",

          data: todayBr(),

          versao: "1.0",

          jira_url: ticket.meta.jiraUrl || "",

        };

        const fromDraft: Record<string, string> = {};

        for (const [k, v] of Object.entries(draft.data || {})) {

          fromDraft[k] = v == null ? "" : String(v);

        }

        setData({ ...base, ...fromDraft });

        setVersion(draft.version || 1);

        setDraftReady(true);

      } catch (e) {

        setError(errorMessage(e));

      }

    })();

  }, [client, key, dtype, config?.authorDefault]);



  function insertSnippet(fieldKey: string, text: string) {

    const el = textareaRefs.current[fieldKey];

    setData((prev) => ({

      ...prev,

      [fieldKey]: insertText(prev[fieldKey] ?? "", text, el),

    }));

    setFocusedField(fieldKey);

  }



  async function persistDraft(opts?: { silent?: boolean }) {

    const silent = opts?.silent ?? false;

    const payload = await api.saveDraft(
      client,
      key,
      dtype,
      dataRef.current,
      versionRef.current,
    );

    setVersion(payload.version);

    versionRef.current = payload.version;

    if (silent) {

      const time = new Date().toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      });

      setAutoSaveStatus(`Draft salvo automaticamente · ${time}`);

    }

    return payload;

  }



  async function runAutoSave() {

    if (!draftReady || busyRef.current) {

      if (busyRef.current) pendingAutoSaveRef.current = true;

      return;

    }

    if (saveInFlightRef.current) {

      pendingAutoSaveRef.current = true;

      return;

    }

    saveInFlightRef.current = true;

    setAutoSaveStatus("Salvando…");

    try {

      await persistDraft({ silent: true });

    } catch (e) {

      setAutoSaveStatus(null);

      setError(errorMessage(e));

    } finally {

      saveInFlightRef.current = false;

      if (pendingAutoSaveRef.current && !busyRef.current) {

        pendingAutoSaveRef.current = false;

        void runAutoSave();

      }

    }

  }



  useEffect(() => {

    if (!draftReady) return;

    if (skipAutoSaveRef.current) {

      skipAutoSaveRef.current = false;

      return;

    }

    const timer = window.setTimeout(() => {

      void runAutoSave();

    }, 1800);

    return () => window.clearTimeout(timer);

    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounce on data only
  }, [data, draftReady, client, key, dtype]);



  useEffect(() => {

    if (!busy && pendingAutoSaveRef.current && draftReady) {

      pendingAutoSaveRef.current = false;

      void runAutoSave();

    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, draftReady]);



  async function saveDraft() {

    setBusy(true);

    setError(null);

    try {

      await persistDraft();

      setMsg("Draft salvo.");

      setAutoSaveStatus(null);

    } catch (e) {

      setError(errorMessage(e));

    } finally {

      setBusy(false);

    }

  }



  async function generate() {

    setBusy(true);

    setError(null);

    setMsg(null);

    try {

      if (hasExistingDoc) {

        if (
          !confirm(
            "Já existe documento neste chamado. Gerar uma nova versão no histórico?",
          )
        ) {

          return;

        }

      }

      await persistDraft();

      const res = await api.generateDocument(client, key, dtype);

      setHasExistingDoc(true);

      let cloudNote = "";

      try {

        const cloud = { ...defaultCloudConfig(), ...(config?.cloud ?? {}) };

        if (cloud.mode === "cloud" && cloud.token) {

          const b64 = await api.readWorkspaceFileBase64(res.path);

          const bin = atob(b64);

          const bytes = new Uint8Array(bin.length);

          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

          const fileName =
            res.path.replace(/^.*[/\\]/, "") || `${key}.docx`;

          await cloudUploadDocx(cloud, key, fileName, bytes);

          cloudNote = " · enviado à cloud";

        }

      } catch (uploadErr) {

        cloudNote = ` · aviso: upload cloud falhou (${errorMessage(uploadErr)})`;

      }

      setMsg(`Nova versão gerada: ${res.path}${cloudNote}`);

    } catch (e) {

      setError(errorMessage(e));

    } finally {

      setBusy(false);

    }

  }



  return (

    <div className="stack">

      <div>

        <p className="page-sub">

          <Link to={`/chamados/${encodeURIComponent(client)}/${encodeURIComponent(key)}`}>

            {key}

          </Link>

        </p>

        <h1 className="page-title">{LABELS[dtype]}</h1>

        <p className="page-sub">Draft v{version} · placeholders {`{{campo}}`}</p>

        {autoSaveStatus && <p className="page-sub">{autoSaveStatus}</p>}

      </div>



      {error && <div className="error-banner">{error}</div>}

      {msg && <div className="success-banner">{msg}</div>}



      <div className="wizard-with-snippets">

        <div className="panel stack">

          {fields.map((f) => (

            <div className="field" key={f.key}>

              <label>

                {f.label}

                {f.required ? " *" : ""}

              </label>

              {f.multiline ? (

                <textarea

                  ref={(el) => {

                    textareaRefs.current[f.key] = el;

                  }}

                  value={data[f.key] ?? ""}

                  onFocus={() => setFocusedField(f.key)}

                  onChange={(e) => setData({ ...data, [f.key]: e.target.value })}

                />

              ) : (

                <input

                  value={data[f.key] ?? ""}

                  onChange={(e) => setData({ ...data, [f.key]: e.target.value })}

                />

              )}

            </div>

          ))}

        </div>



        <SnippetsPanel

          multilineFields={multilineFields}

          focusedField={focusedField}

          onInsert={insertSnippet}

        />

      </div>

      <DraftPrintsPanel client={client} ticketKey={key} docType={dtype} />

      <div className="row">

        <button className="btn" disabled={busy} onClick={() => void saveDraft()}>

          Salvar draft

        </button>

        <button

          className="btn btn-primary"

          disabled={busy}

          onClick={() => void generate()}

        >

          Gerar .docx

        </button>

        <Link

          className="btn"

          to={`/chamados/${encodeURIComponent(client)}/${encodeURIComponent(key)}`}

        >

          Voltar

        </Link>

      </div>

    </div>

  );

}


