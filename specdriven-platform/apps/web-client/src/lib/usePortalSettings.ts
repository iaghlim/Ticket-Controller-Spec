import { useCallback, useEffect, useState } from "react";
import type { PortalSettings } from "@specdriven/shared";
import { ApiError, getPortalSettings } from "../lib/api";

export function usePortalSettings() {
  const [settings, setSettings] = useState<PortalSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getPortalSettings();
      setSettings(res);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Não foi possível carregar as configurações do portal.",
      );
      setSettings(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { settings, loading, error, reload: load };
}
