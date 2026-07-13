import { useEffect, useState } from "react";
import { listClients } from "./api";
import { useAuth } from "./auth";

export function useClientContext() {
  const { user } = useAuth();
  const [clientName, setClientName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!user?.clientId) {
        if (!cancelled) {
          setClientName(user?.name ?? null);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      try {
        const { clients } = await listClients();
        if (cancelled) return;
        const client = clients.find((c) => c.id === user.clientId);
        setClientName(client?.name ?? user.name ?? null);
      } catch {
        if (!cancelled) setClientName(user.name ?? null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [user?.clientId, user?.name]);

  const organizationName = user?.organizationName ?? "Consultoria";
  const displayClientName = clientName ?? user?.name ?? "Cliente";

  return {
    clientName: displayClientName,
    organizationName,
    loading,
  };
}
