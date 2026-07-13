import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api } from "./api";
import {
  assertStaffUser,
  cloudFromConfig,
  cloudLogin,
  cloudMe,
  CloudApiError,
  type AuthUser,
} from "./cloud";
import { useWorkspace } from "./workspace";

type CloudAuthState = {
  user: AuthUser | null;
  loading: boolean;
  isCloudMode: boolean;
  login: (email: string, password: string, apiUrl?: string) => Promise<void>;
  logout: () => Promise<void>;
  useLocalMode: () => Promise<void>;
};

const CloudAuthContext = createContext<CloudAuthState | null>(null);

export function CloudAuthProvider({ children }: { children: ReactNode }) {
  const { config, setConfig } = useWorkspace();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const cloud = useMemo(() => cloudFromConfig(config), [config]);
  const isCloudMode = cloud.mode === "cloud";

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      if (!isCloudMode || !cloud.token) {
        if (!cancelled) {
          setUser(null);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      try {
        const { user: restored } = await cloudMe(cloud);
        assertStaffUser(restored);
        if (!cancelled) setUser(restored);
      } catch (err) {
        if (
          err instanceof CloudApiError &&
          (err.status === 401 || err.status === 403)
        ) {
          try {
            const cfg = await api.updateConfig({
              cloudToken: "",
              cloudEmail: "",
            });
            if (!cancelled) setConfig(cfg);
          } catch {
            /* ignore persist errors */
          }
        }
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void restoreSession();
    return () => {
      cancelled = true;
    };
  }, [isCloudMode, cloud.token, cloud.apiUrl, setConfig]);

  const login = useCallback(
    async (email: string, password: string, apiUrlOverride?: string) => {
      const base = cloudFromConfig(config);
      const apiUrl = apiUrlOverride ?? base.apiUrl;
      const res = await cloudLogin(
        { ...base, mode: "cloud", apiUrl },
        email.trim(),
        password,
      );
      assertStaffUser(res.user);
      const cfg = await api.updateConfig({
        cloudMode: "cloud",
        cloudApiUrl: apiUrl,
        cloudToken: res.token,
        cloudEmail: res.user.email,
      });
      setConfig(cfg);
      setUser(res.user);
    },
    [config, setConfig],
  );

  const logout = useCallback(async () => {
    const cfg = await api.updateConfig({
      cloudMode: "local",
      cloudToken: "",
      cloudEmail: "",
      cloudLastSyncAt: "",
    });
    setConfig(cfg);
    setUser(null);
  }, [setConfig]);

  const useLocalMode = useCallback(async () => {
    const cfg = await api.updateConfig({
      cloudMode: "local",
      cloudToken: "",
      cloudEmail: "",
    });
    setConfig(cfg);
    setUser(null);
  }, [setConfig]);

  const value = useMemo(
    () => ({
      user,
      loading,
      isCloudMode,
      login,
      logout,
      useLocalMode,
    }),
    [user, loading, isCloudMode, login, logout, useLocalMode],
  );

  return (
    <CloudAuthContext.Provider value={value}>{children}</CloudAuthContext.Provider>
  );
}

export function useCloudAuth(): CloudAuthState {
  const ctx = useContext(CloudAuthContext);
  if (!ctx) throw new Error("useCloudAuth fora do CloudAuthProvider");
  return ctx;
}

export function useCloudConfig() {
  const { config } = useWorkspace();
  return cloudFromConfig(config);
}
