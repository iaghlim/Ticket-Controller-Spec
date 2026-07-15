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
      
      // Load offerings from localStorage or defaults
      const saved = localStorage.getItem("specdriven.service_offerings");
      let offerings = [];
      if (saved) {
        try {
          offerings = JSON.parse(saved);
        } catch (e) {
          // ignore
        }
      }
      if (offerings.length === 0) {
        offerings = [
          { id: "offering-1", name: "Suporte Nível 1 - 8x5", active: true },
          { id: "offering-2", name: "Suporte Premium - 24x7", active: true },
          { id: "offering-3", name: "Consultoria Técnica Especializada", active: true },
        ];
      }
      
      setSettings({
        ...res,
        serviceOfferings: offerings,
      });
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
