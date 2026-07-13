import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, getSettings, type StaffSettingsResponse } from "../../lib/api";

type CompletenessKey = keyof StaffSettingsResponse["completeness"];

const CARDS: {
  key: CompletenessKey;
  title: string;
  description: string;
  to: string;
  sprint?: string;
}[] = [
  {
    key: "profile",
    title: "Perfil",
    description: "Nome exibido e contato de suporte ao cliente.",
    to: "/settings/organization",
  },
  {
    key: "sla",
    title: "SLA",
    description: "Políticas de prazo por cliente e prioridade.",
    to: "/settings/sla",
  },
  {
    key: "catalog",
    title: "Catálogo",
    description: "Tipos de chamado e módulos do portal cliente.",
    to: "/settings/catalog",
  },
  {
    key: "communication",
    title: "Comunicação",
    description: "E-mail, notificações e base de conhecimento.",
    to: "/settings/email",
  },
];

export function SettingsIndexPage() {
  const [data, setData] = useState<StaffSettingsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getSettings();
      setData(res);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Não foi possível carregar as configurações.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <p className="muted">Carregando configurações…</p>;
  }

  if (error) {
    return <p className="error">{error}</p>;
  }

  if (!data) return null;

  return (
    <div>
      <div className="panel-head">
        <h2>Completude</h2>
        <p>
          Indicadores do que já está pronto para o portal do cliente.
          {!data.canEdit ? (
            <span className="muted"> Modo leitura — apenas gestor ou admin pode editar.</span>
          ) : null}
        </p>
      </div>

      <div className="settings-completeness-grid">
        {CARDS.map((card) => {
          const complete = data.completeness[card.key];
          return (
            <Link
              key={card.key}
              to={card.to}
              className={`settings-completeness-card${complete ? " complete" : " incomplete"}`}
            >
              <div className="settings-completeness-card-head">
                <strong>{card.title}</strong>
                <span
                  className={`settings-status-pill${complete ? " ok" : " warn"}`}
                >
                  {complete ? "Completo" : "Incompleto"}
                </span>
              </div>
              <p className="muted">{card.description}</p>
              {card.sprint ? (
                <span className="settings-sprint-tag">{card.sprint}</span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
