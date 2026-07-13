import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  ApiError,
  exitOrg as apiExitOrg,
  getStoredToken,
  isStaffRole,
  login as apiLogin,
  me,
  setStoredToken,
  switchOrg as apiSwitchOrg,
  type AuthUser,
} from "./api";

type AuthState = {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  switchOrg: (organizationId: string) => Promise<void>;
  exitOrg: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

function assertStaff(user: AuthUser): AuthUser {
  if (!isStaffRole(user.role)) {
    throw new ApiError(
      403,
      { error: "staff_only" },
      "Este portal é exclusivo para gestor/consultor. Use o portal do cliente.",
    );
  }
  return user;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(() => getStoredToken());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      const stored = getStoredToken();
      if (!stored) {
        if (!cancelled) {
          setLoading(false);
          setUser(null);
          setToken(null);
        }
        return;
      }
      try {
        const { user: u } = await me(stored);
        assertStaff(u);
        if (!cancelled) {
          setUser(u);
          setToken(stored);
        }
      } catch (err) {
        if (
          err instanceof ApiError &&
          (err.status === 401 || err.status === 403)
        ) {
          setStoredToken(null);
        }
        if (!cancelled) {
          setUser(null);
          setToken(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiLogin(email, password);
    assertStaff(res.user);
    setStoredToken(res.token);
    setToken(res.token);
    setUser(res.user);
    return res.user;
  }, []);

  const logout = useCallback(() => {
    setStoredToken(null);
    setToken(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const stored = getStoredToken();
    if (!stored) return;
    const { user: u } = await me(stored);
    assertStaff(u);
    setUser(u);
  }, []);

  const switchOrg = useCallback(async (organizationId: string) => {
    const res = await apiSwitchOrg(organizationId);
    assertStaff(res.user);
    setStoredToken(res.token);
    setToken(res.token);
    setUser(res.user);
  }, []);

  const exitOrg = useCallback(async () => {
    const res = await apiExitOrg();
    assertStaff(res.user);
    setStoredToken(res.token);
    setToken(res.token);
    setUser(res.user);
  }, []);

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      login,
      logout,
      refreshUser,
      switchOrg,
      exitOrg,
    }),
    [user, token, loading, login, logout, refreshUser, switchOrg, exitOrg],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
