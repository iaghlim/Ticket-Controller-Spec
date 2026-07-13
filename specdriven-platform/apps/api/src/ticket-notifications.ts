import type {
  ClientNotificationEvent,
  NotificationPrefs,
  StaffNotificationEvent,
} from "@specdriven/shared";
import { parseNotificationPrefs } from "@specdriven/shared";
import { prisma } from "./db.js";
import {
  sendTicketCommentEmail,
  sendTicketStatusEmail,
} from "./mail.js";
import { createNotification } from "./notifications.js";
import { getOrCreateSettingsRecord } from "./settings.js";

export async function getOrgNotificationPrefs(
  organizationId: string,
): Promise<NotificationPrefs> {
  const settings = await getOrCreateSettingsRecord(organizationId);
  return parseNotificationPrefs(settings.notificationPrefsJson);
}

export function clientChannelEnabled(
  prefs: NotificationPrefs,
  event: ClientNotificationEvent,
  channel: "inApp" | "email",
): boolean {
  return prefs.client[event][channel];
}

export function staffChannelEnabled(
  prefs: NotificationPrefs,
  event: StaffNotificationEvent,
  channel: "inApp" | "email",
): boolean {
  return prefs.staff[event][channel];
}

async function getClientUsersForTicket(clientId: string) {
  return prisma.user.findMany({
    where: { clientId, role: "cliente" },
    select: { id: true, email: true },
  });
}

export async function notifyClientUsersOnTicket(opts: {
  organizationId: string;
  clientId: string;
  ticketKey: string;
  event: ClientNotificationEvent;
  title: string;
  body: string;
  email?: {
    send: (to: string) => Promise<unknown>;
  };
}): Promise<void> {
  const prefs = await getOrgNotificationPrefs(opts.organizationId);
  const inApp = clientChannelEnabled(prefs, opts.event, "inApp");
  const email = clientChannelEnabled(prefs, opts.event, "email");
  if (!inApp && !email) return;

  const users = await getClientUsersForTicket(opts.clientId);
  for (const u of users) {
    if (inApp) {
      await createNotification({
        organizationId: opts.organizationId,
        userId: u.id,
        title: opts.title,
        body: opts.body,
        href: `/tickets/${opts.ticketKey}`,
      });
    }
    if (email && opts.email && u.email) {
      await opts.email.send(u.email);
    }
  }
}

export async function notifyStaffOnClientComment(opts: {
  organizationId: string;
  ticketKey: string;
  assigneeId: string | null;
  authorId: string;
  body: string;
}): Promise<void> {
  const prefs = await getOrgNotificationPrefs(opts.organizationId);
  if (!staffChannelEnabled(prefs, "ticket.comment_public", "inApp")) return;

  const recipients = prefs.staff["ticket.comment_public"].recipients ?? [
    "assignee",
    "gestores",
  ];
  const userIds = new Set<string>();

  if (recipients.includes("assignee") && opts.assigneeId) {
    userIds.add(opts.assigneeId);
  }

  if (recipients.includes("gestores")) {
    const gestores = await prisma.user.findMany({
      where: { organizationId: opts.organizationId, role: "gestor" },
      select: { id: true },
    });
    for (const g of gestores) userIds.add(g.id);
  }

  userIds.delete(opts.authorId);

  const title = `Cliente comentou em ${opts.ticketKey}`;
  const preview = opts.body.slice(0, 160);
  for (const userId of userIds) {
    await createNotification({
      organizationId: opts.organizationId,
      userId,
      title,
      body: preview,
      href: `/tickets/${opts.ticketKey}`,
    });
  }
}

export async function notifyClientOnStaffPublicComment(opts: {
  organizationId: string;
  clientId: string;
  ticketKey: string;
  body: string;
}): Promise<void> {
  const preview = opts.body.slice(0, 160);
  await notifyClientUsersOnTicket({
    organizationId: opts.organizationId,
    clientId: opts.clientId,
    ticketKey: opts.ticketKey,
    event: "ticket.comment_public",
    title: `Nova resposta em ${opts.ticketKey}`,
    body: preview,
    email: {
      send: (to) =>
        sendTicketCommentEmail({
          to,
          ticketKey: opts.ticketKey,
          preview,
          organizationId: opts.organizationId,
        }),
    },
  });
}

export async function notifyClientOnStatusChange(opts: {
  organizationId: string;
  clientId: string;
  ticketKey: string;
  fromStatus: string;
  toStatus: string;
}): Promise<void> {
  await notifyClientUsersOnTicket({
    organizationId: opts.organizationId,
    clientId: opts.clientId,
    ticketKey: opts.ticketKey,
    event: "ticket.status_changed",
    title: `Chamado ${opts.ticketKey}: status ${opts.toStatus}`,
    body: `De ${opts.fromStatus} para ${opts.toStatus}`,
    email: {
      send: (to) =>
        sendTicketStatusEmail({
          to,
          ticketKey: opts.ticketKey,
          fromStatus: opts.fromStatus,
          toStatus: opts.toStatus,
          organizationId: opts.organizationId,
        }),
    },
  });
}

export async function notifyClientOnTicketCreated(opts: {
  organizationId: string;
  clientId: string;
  ticketKey: string;
  authorUserId: string;
}): Promise<void> {
  const prefs = await getOrgNotificationPrefs(opts.organizationId);
  const inApp = clientChannelEnabled(prefs, "ticket.created", "inApp");
  const email = clientChannelEnabled(prefs, "ticket.created", "email");
  if (!inApp && !email) return;

  const user = await prisma.user.findFirst({
    where: { id: opts.authorUserId, clientId: opts.clientId },
    select: { id: true, email: true },
  });
  if (!user) return;

  if (inApp) {
    await createNotification({
      organizationId: opts.organizationId,
      userId: user.id,
      title: `Chamado ${opts.ticketKey} registrado`,
      body: "Sua solicitação foi recebida pela equipe.",
      href: `/tickets/${opts.ticketKey}`,
    });
  }

  if (email && user.email) {
    await sendTicketStatusEmail({
      to: user.email,
      ticketKey: opts.ticketKey,
      fromStatus: "novo",
      toStatus: "registrado",
      organizationId: opts.organizationId,
    });
  }
}
