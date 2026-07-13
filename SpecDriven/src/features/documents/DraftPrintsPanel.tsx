import { useCallback, useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { api, errorMessage } from "../../shared/api";
import type { DocType, DraftPrint } from "../../shared/types";

type Props = {
  client: string;
  ticketKey: string;
  docType: DocType;
};

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function DraftPrintsPanel({ client, ticketKey, docType }: Props) {
  const [prints, setPrints] = useState<DraftPrint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const payload = await api.listDraftPrints(client, ticketKey, docType);
      setPrints(payload.prints || []);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [client, ticketKey, docType]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function addFromDialog() {
    setBusy(true);
    setError(null);
    try {
      const selected = await open({
        multiple: true,
        filters: [{ name: "Imagens", extensions: ["png", "jpg", "jpeg"] }],
      });
      if (!selected) return;
      const paths = Array.isArray(selected) ? selected : [selected];
      for (const path of paths) {
        await api.addDraftPrint(client, ticketKey, docType, path);
      }
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function addFromClipboard() {
    setBusy(true);
    setError(null);
    try {
      const items = await navigator.clipboard.read();
      let added = false;
      for (const item of items) {
        const type =
          item.types.find((t) => t === "image/png") ||
          item.types.find((t) => t === "image/jpeg") ||
          item.types.find((t) => t.startsWith("image/"));
        if (!type) continue;
        const blob = await item.getType(type);
        const ext = type.includes("jpeg") || type.includes("jpg") ? "jpg" : "png";
        const base64 = await blobToBase64(blob);
        await api.addDraftPrintBytes(
          client,
          ticketKey,
          docType,
          `clipboard-${Date.now()}.${ext}`,
          base64,
        );
        added = true;
      }
      if (!added) {
        setError("Nenhuma imagem na área de transferência.");
      } else {
        await refresh();
      }
    } catch (e) {
      setError(
        errorMessage(e) ||
          "Não foi possível ler a área de transferência. Use Ctrl+V no painel ou adicione arquivo.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onPaste(e: React.ClipboardEvent) {
    const files = Array.from(e.clipboardData.files || []);
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) return;
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      for (const file of images) {
        const ext = file.type.includes("jpeg") || file.type.includes("jpg") ? "jpg" : "png";
        const base64 = await blobToBase64(file);
        await api.addDraftPrintBytes(
          client,
          ticketKey,
          docType,
          file.name || `paste-${Date.now()}.${ext}`,
          base64,
        );
      }
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setError(null);
    try {
      const payload = await api.removeDraftPrint(client, ticketKey, docType, id);
      setPrints(payload.prints || []);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel stack" tabIndex={0} onPaste={onPaste}>
      <div>
        <strong>Prints</strong>
        <p className="page-sub" style={{ margin: "0.25rem 0 0" }}>
          Anexe imagens (png/jpg) ou cole com Ctrl+V. Até 10. Entram no final do .docx na geração.
        </p>
      </div>
      {error && <div className="error-banner">{error}</div>}
      <div className="row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
        <button type="button" className="btn" disabled={busy} onClick={() => void addFromDialog()}>
          Adicionar arquivo
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => void addFromClipboard()}
        >
          Colar da área de transferência
        </button>
      </div>
      {prints.length === 0 ? (
        <p className="muted">Nenhum print ainda.</p>
      ) : (
        <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0, gap: "0.35rem" }}>
          {prints.map((p) => (
            <li
              key={p.id}
              className="row"
              style={{ justifyContent: "space-between", gap: "0.5rem" }}
            >
              <span className="mono" style={{ fontSize: "0.85rem" }}>
                {p.fileName}
              </span>
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => void remove(p.id)}
              >
                Remover
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
