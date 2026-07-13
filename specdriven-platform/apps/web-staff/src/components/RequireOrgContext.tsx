import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { isPlatformMaster } from "../lib/session";

/** Bloqueia rotas operacionais para master no console plataforma. */
export function RequireOrgContext() {
  const { user } = useAuth();
  if (isPlatformMaster(user)) {
    return <Navigate to="/master" replace />;
  }
  return <Outlet />;
}
