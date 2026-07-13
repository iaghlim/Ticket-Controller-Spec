import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, errorMessage } from "./api";
import type { AppConfig, WorkspaceTree } from "./types";

interface WorkspaceContextValue {
  config: AppConfig | null;
  tree: WorkspaceTree | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setConfig: (cfg: AppConfig) => void;
  clearError: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [tree, setTree] = useState<WorkspaceTree | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const cfg = await api.getConfig();
      setConfig(cfg);
      document.documentElement.dataset.theme = cfg.ui?.theme || "system";
      if (cfg.rootPath) {
        const t = await api.scanWorkspace();
        setTree(t);
      } else {
        setTree(null);
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({
      config,
      tree,
      loading,
      error,
      refresh,
      setConfig,
      clearError: () => setError(null),
    }),
    [config, tree, loading, error, refresh],
  );

  return (
    <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace fora do provider");
  return ctx;
}
