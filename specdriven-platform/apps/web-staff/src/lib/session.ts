import type { AuthUser } from "./api";

/** Master no console plataforma (sem consultoria ativa). */
export function isPlatformMaster(user: AuthUser | null | undefined): boolean {
  return user?.role === "master" && user.isPlatformContext === true;
}

/** Master atuando dentro de uma consultoria. */
export function isActingMaster(user: AuthUser | null | undefined): boolean {
  return user?.role === "master" && user.isPlatformContext === false;
}
