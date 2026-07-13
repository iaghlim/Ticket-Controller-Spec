import { useCallback, useEffect, useMemo, useState } from "react";
import { api, errorMessage } from "../../shared/api";
import { cloudSyncPush } from "../../shared/cloud";
import type { ActiveTimerView, SearchHit } from "../../shared/types";

function formatElapsed(totalSecs: number): string {
  const s = Math.max(0, Math.floor(totalSecs));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((n) => String(n).padStart(2, "0")).join(":");
}

export function TimerOverlay() {
  const [timer, setTimer] = useState<ActiveTimerView | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [selected, setSelected] = useState<{
    client: string;
    key: string;
    title: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [showHits, setShowHits] = useState(false);
  const [compact, setCompact] = useState(false);

  async function toggleCompact() {
    const next = !compact;
    setCompact(next);
    try {
      await api.setTimerOverlayCompact(next);
    } catch (e) {
      setError(errorMessage(e));
      setCompact(!next);
    }
  }

  const refresh = useCallback(async () => {
    try {
      const t = await api.getActiveTimer();
      setTimer(t);
      if (t) {
        setSelected({ client: t.client, key: t.key, title: t.title });
        setQuery(t.key);
      }
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    // Match app theme so overlay is not a light blank-looking panel on dark OS.
    void (async () => {
      try {
        const cfg = await api.getConfig();
        document.documentElement.dataset.theme = cfg.ui?.theme || "system";
      } catch {
        document.documentElement.dataset.theme = "system";
      }
    })();
    void refresh();
    const id = setInterval(() => {
      void refresh();
      setTick((x) => x + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    if (!query.trim() || (timer && query === timer.key && !showHits)) {
      setHits([]);
      return;
    }
    const t = setTimeout(() => {
      void (async () => {
        try {
          setHits(await api.search(query));
        } catch {
          setHits([]);
        }
      })();
    }, 180);
    return () => clearTimeout(t);
  }, [query, timer, showHits]);

  const displaySecs = useMemo(() => {
    void tick;
    return timer?.elapsedSecs ?? 0;
  }, [timer, tick]);

  async function play() {
    setError(null);
    const target = selected;
    if (!target) {
      setError("Selecione um chamado (chave Jira).");
      return;
    }
    try {
      const t = await api.startTimer(target.client, target.key, target.title, false);
      setTimer(t);
      setShowHits(false);
    } catch (e) {
      const msg = errorMessage(e);
      if (msg.includes("Já existe um timer") || msg.includes("Confirme")) {
        if (
          confirm(
            `${msg}\n\nFinalizar o timer anterior e iniciar em ${target.key}?`,
          )
        ) {
          try {
            const t = await api.startTimer(
              target.client,
              target.key,
              target.title,
              true,
            );
            setTimer(t);
            setShowHits(false);
          } catch (e2) {
            setError(errorMessage(e2));
          }
        }
      } else {
        setError(msg);
      }
    }
  }

  async function pause() {
    setError(null);
    try {
      setTimer(await api.pauseTimer());
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function stop() {
    setError(null);
    const note = prompt("Nota opcional para esta sessão:", timer?.note ?? "") ?? undefined;
    const ticketKey = timer?.key;
    try {
      const summary = await api.stopTimer(note);
      setTimer(null);

      // Fase D: sobe última entrada de horas se modo Cloud.
      try {
        const cfg = await api.getConfig();
        const cloud = cfg.cloud;
        if (cloud?.mode === "cloud" && cloud.token && ticketKey) {
          const last = summary.entries?.[summary.entries.length - 1];
          if (last) {
            await cloudSyncPush(
              {
                mode: "cloud",
                apiUrl: cloud.apiUrl || "http://127.0.0.1:3000",
                token: cloud.token,
                email: cloud.email ?? null,
                lastSyncAt: cloud.lastSyncAt ?? null,
              },
              {
                timeEntries: [
                  {
                    ticketKey,
                    startedAt: last.startedAt,
                    endedAt: last.endedAt ?? null,
                    seconds: last.seconds,
                    note: last.note ?? note ?? null,
                    clientLocalId: last.id,
                  },
                ],
              },
            );
          }
        }
      } catch {
        // Sync cloud é best-effort; horas locais já persistiram.
      }
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const isRunning = timer?.status === "running";
  const isPaused = timer?.status === "paused";

  return (
    <div className={`overlay-root${compact ? " compact" : ""}`}>
      <div className="overlay-drag" data-tauri-drag-region>
        <span className="overlay-brand" data-tauri-drag-region>
          {compact ? (
            <span className="mono">{formatElapsed(displaySecs)}</span>
          ) : (
            "SpecDriven"
          )}
        </span>
        {compact && (
          <div className="overlay-controls overlay-controls-compact">
            {!isRunning ? (
              <button type="button" className="overlay-btn play" onClick={() => void play()}>
                ▶
              </button>
            ) : (
              <button type="button" className="overlay-btn pause" onClick={() => void pause()}>
                ⏸
              </button>
            )}
          </div>
        )}
        <div className="overlay-win-actions">
          <button
            type="button"
            className="overlay-icon-btn"
            title={compact ? "Expandir" : "Minimizar"}
            onClick={() => void toggleCompact()}
          >
            {compact ? "▢" : "─"}
          </button>
          <button
            type="button"
            className="overlay-icon-btn"
            title="Abrir app"
            onClick={() => void api.focusMainWindow()}
          >
            ↗
          </button>
          <button
            type="button"
            className="overlay-icon-btn"
            title="Ocultar"
            onClick={() => void api.closeTimerOverlay()}
          >
            ×
          </button>
        </div>
      </div>

      {!compact && (
        <div className="overlay-body">
          <div className="overlay-search-wrap">
            <input
              className="overlay-input mono"
              placeholder="PROJ-123…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value.toUpperCase());
                setShowHits(true);
              }}
              onFocus={() => setShowHits(true)}
            />
            {showHits && hits.length > 0 && (
              <div className="overlay-hits">
                {hits.slice(0, 5).map((h) => (
                  <button
                    key={`${h.client}/${h.key}`}
                    type="button"
                    className="overlay-hit"
                    onClick={() => {
                      setSelected({ client: h.client, key: h.key, title: h.title });
                      setQuery(h.key);
                      setShowHits(false);
                    }}
                  >
                    <strong className="mono">{h.key}</strong>
                    <span className="muted"> {h.client}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="overlay-main-row">
            <div className="overlay-time mono">{formatElapsed(displaySecs)}</div>
            <div className="overlay-controls">
              {!isRunning ? (
                <button type="button" className="overlay-btn play" onClick={() => void play()}>
                  ▶
                </button>
              ) : (
                <button type="button" className="overlay-btn pause" onClick={() => void pause()}>
                  ⏸
                </button>
              )}
              <button
                type="button"
                className="overlay-btn stop"
                disabled={!timer}
                onClick={() => void stop()}
              >
                ■
              </button>
            </div>
          </div>

          <div className="overlay-meta muted">
            {selected ? (
              <>
                <span className="mono">{selected.key}</span>
                {isPaused && <span> · pausado</span>}
                {isRunning && <span> · gravando</span>}
              </>
            ) : (
              "Selecione um chamado"
            )}
          </div>
        </div>
      )}

      {error && <div className="overlay-error">{error}</div>}
    </div>
  );
}
