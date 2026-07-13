import type { UserRole } from "@specdriven/shared";
import type { AuthUser } from "./auth.js";

export function isMaster(role: UserRole): boolean {
  return role === "master";
}

export function isAdmin(role: UserRole): boolean {
  return role === "admin";
}

/** Staff portal + operação ITIL (não inclui cliente). */
export function isStaffRole(role: UserRole): boolean {
  return (
    role === "master" ||
    role === "admin" ||
    role === "gestor" ||
    role === "consultor"
  );
}

export function isStaff(user: AuthUser): boolean {
  return isStaffRole(user.role);
}

export function isGestor(user: AuthUser): boolean {
  return user.role === "gestor";
}

export function canManageClients(user: AuthUser): boolean {
  return (
    user.role === "master" ||
    user.role === "admin" ||
    user.role === "gestor" ||
    user.role === "consultor"
  );
}

export function canManageProjects(user: AuthUser): boolean {
  return user.role === "master" || user.role === "admin";
}

export function canInvite(user: AuthUser, targetRole: UserRole): boolean {
  if (user.role === "master") return true;
  if (user.role === "admin") {
    return (
      targetRole === "cliente" ||
      targetRole === "consultor" ||
      targetRole === "gestor"
    );
  }
  if (user.role === "gestor") return true;
  if (user.role === "consultor" && targetRole === "cliente") return true;
  return false;
}

export function canManageOrganizations(user: AuthUser): boolean {
  return user.role === "master";
}

export function canCreateOrgUsers(user: AuthUser): boolean {
  return user.role === "master";
}
