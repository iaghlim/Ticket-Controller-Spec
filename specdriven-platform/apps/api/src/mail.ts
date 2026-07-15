/**
 * Transactional mail — configurable provider.
 * - `log` (default): stub — prints to stdout (dev sem SMTP).
 * - `smtp`: nodemailer → SMTP_HOST/PORT (ex.: Mailpit local).
 */

import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { prisma } from "./db.js";

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  organizationId?: string;
  fromName?: string | null;
  replyTo?: string | null;
  footerText?: string | null;
};

export type MailResult = {
  provider: string;
  delivered: boolean;
  messageId?: string;
  error?: string;
};

let smtpTransporter: Transporter | null = null;
const orgSmtpTransporters = new Map<string, Transporter>();

type OrgSmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from?: string | null;
};

function mailProvider(): string {
  return (process.env.MAIL_PROVIDER ?? "log").toLowerCase();
}

function mailFromAddress(): string {
  return process.env.MAIL_FROM ?? "noreply@specdriven.local";
}

function getSmtpTransporter(): Transporter {
  if (smtpTransporter) return smtpTransporter;

  const host = process.env.SMTP_HOST?.trim();
  if (!host) {
    throw new Error("SMTP_HOST is required when MAIL_PROVIDER=smtp");
  }

  smtpTransporter = createSmtpTransporter({
    host,
    port: Number(process.env.SMTP_PORT ?? "587"),
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER?.trim(),
    pass: process.env.SMTP_PASS ?? "",
  });
  return smtpTransporter;
}

function createSmtpTransporter(config: {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
}): Transporter {
  if (!Number.isFinite(config.port) || config.port <= 0) {
    throw new Error(`Invalid SMTP port: ${config.port}`);
  }

  const user = config.user?.trim();
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: user ? { user, pass: config.pass ?? "" } : undefined,
  });
}

function getOrgSmtpTransporter(organizationId: string, config: OrgSmtpConfig): Transporter {
  const cached = orgSmtpTransporters.get(organizationId);
  if (cached) return cached;

  const transport = createSmtpTransporter({
    host: config.host,
    port: config.port,
    secure: config.secure,
    user: config.user,
    pass: config.pass,
  });
  orgSmtpTransporters.set(organizationId, transport);
  return transport;
}

async function resolveOrgSmtpFromDb(
  organizationId: string,
): Promise<OrgSmtpConfig | null> {
  const settings = await prisma.organizationSettings.findUnique({
    where: { organizationId },
    select: {
      smtpEnabled: true,
      smtpHost: true,
      smtpPort: true,
      smtpUser: true,
      smtpPass: true,
      smtpFrom: true,
    },
  });
  if (!settings?.smtpEnabled || !settings.smtpHost?.trim()) return null;

  const port = settings.smtpPort ?? 587;
  return {
    host: settings.smtpHost.trim(),
    port,
    secure: port === 465,
    user: settings.smtpUser?.trim() || undefined,
    pass: settings.smtpPass ?? undefined,
    from: settings.smtpFrom,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatFromHeader(displayName: string | null | undefined): string {
  const addr = mailFromAddress();
  const name = displayName?.trim();
  if (!name) return addr;
  const safe = name.replace(/"/g, "'");
  return `"${safe}" <${addr}>`;
}

function appendFooter(
  text: string,
  html: string | undefined,
  footerText: string | null | undefined,
): { text: string; html?: string } {
  const footer = footerText?.trim();
  if (!footer) return { text, html };

  const textWithFooter = `${text}\n\n---\n${footer}`;
  const htmlWithFooter = html
    ? `${html}<hr/><p style="color:#666;font-size:12px">${escapeHtml(footer).replace(/\n/g, "<br/>")}</p>`
    : undefined;

  return { text: textWithFooter, html: htmlWithFooter ?? html };
}

async function resolveOrgMailFromDb(organizationId: string): Promise<{
  fromName: string | null;
  replyTo: string | null;
  footerText: string | null;
}> {
  const settings = await prisma.organizationSettings.findUnique({
    where: { organizationId },
    select: {
      emailFromName: true,
      emailReplyTo: true,
      emailFooterText: true,
    },
  });
  return {
    fromName: settings?.emailFromName ?? null,
    replyTo: settings?.emailReplyTo ?? null,
    footerText: settings?.emailFooterText ?? null,
  };
}

async function resolveMailHeaders(message: MailMessage): Promise<{
  from: string;
  replyTo?: string;
  footerText: string | null;
}> {
  if (message.organizationId) {
    const org = await resolveOrgMailFromDb(message.organizationId);
    return {
      from: formatFromHeader(message.fromName ?? org.fromName),
      replyTo: message.replyTo ?? org.replyTo ?? undefined,
      footerText: message.footerText ?? org.footerText,
    };
  }

  return {
    from: formatFromHeader(message.fromName),
    replyTo: message.replyTo ?? undefined,
    footerText: message.footerText ?? null,
  };
}

async function sendViaLog(
  message: MailMessage,
  headers: { from: string; replyTo?: string },
): Promise<MailResult> {
  const messageId = `log-${Date.now()}`;
  console.info("[mail:log]", {
    messageId,
    from: headers.from,
    replyTo: headers.replyTo,
    to: message.to,
    subject: message.subject,
    text: message.text,
  });
  return { provider: "log", delivered: true, messageId };
}

export async function sendMail(message: MailMessage): Promise<MailResult> {
  const provider = mailProvider();
  const headers = await resolveMailHeaders(message);
  const body = appendFooter(message.text, message.html, headers.footerText);

  if (provider === "smtp") {
    try {
      const orgSmtp = message.organizationId
        ? await resolveOrgSmtpFromDb(message.organizationId)
        : null;
      const transport = orgSmtp
        ? getOrgSmtpTransporter(message.organizationId!, orgSmtp)
        : getSmtpTransporter();
      const from =
        orgSmtp?.from?.trim() ||
        headers.from;
      const info = await transport.sendMail({
        from,
        replyTo: headers.replyTo,
        to: message.to,
        subject: message.subject,
        text: body.text,
        html: body.html,
      });
      console.info("[mail:smtp]", {
        messageId: info.messageId,
        to: message.to,
        subject: message.subject,
        orgSmtp: Boolean(orgSmtp),
      });
      return {
        provider: "smtp",
        delivered: true,
        messageId: info.messageId,
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.warn(
        "[mail] MAIL_PROVIDER=smtp failed — falling back to log",
        { to: message.to, subject: message.subject, error },
      );
      const fallback = await sendViaLog(message, headers);
      return { ...fallback, error };
    }
  }

  if (provider !== "log") {
    console.warn(
      `[mail] unknown MAIL_PROVIDER=${provider} — using log stub`,
    );
  }

  return sendViaLog(message, headers);
}

export async function sendInviteEmail(opts: {
  to: string;
  role: string;
  token: string;
  expiresAt: Date;
  organizationId?: string;
}): Promise<MailResult> {
  const base =
    process.env.APP_PUBLIC_URL?.replace(/\/$/, "") ?? "http://localhost:5173";
  const acceptUrl = `${base}/accept-invite?token=${encodeURIComponent(opts.token)}`;
  const text = [
    `Você foi convidado como ${opts.role}.`,
    `Aceite o convite: ${acceptUrl}`,
    `Token: ${opts.token}`,
    `Expira em: ${opts.expiresAt.toISOString()}`,
    ``,
    `API: POST /invites/accept { "token", "name", "password" }`,
  ].join("\n");

  return sendMail({
    to: opts.to,
    subject: "Convite SpecDriven Platform",
    text,
    html: [
      `<p>Você foi convidado como <strong>${escapeHtml(opts.role)}</strong>.</p>`,
      `<p><a href="${escapeHtml(acceptUrl)}">Aceitar convite</a></p>`,
      `<p>Expira em: ${escapeHtml(opts.expiresAt.toISOString())}</p>`,
    ].join("\n"),
    organizationId: opts.organizationId,
  });
}

export async function sendTicketStatusEmail(opts: {
  to: string;
  ticketKey: string;
  fromStatus: string;
  toStatus: string;
  organizationId: string;
}): Promise<MailResult> {
  const base =
    process.env.APP_PUBLIC_URL?.replace(/\/$/, "") ?? "http://localhost:5173";
  const ticketUrl = `${base}/tickets/${encodeURIComponent(opts.ticketKey)}`;
  const text = [
    `O chamado ${opts.ticketKey} mudou de ${opts.fromStatus} para ${opts.toStatus}.`,
    `Ver: ${ticketUrl}`,
  ].join("\n");

  return sendMail({
    to: opts.to,
    subject: `Chamado ${opts.ticketKey}: status ${opts.toStatus}`,
    text,
    html: [
      `<p>O chamado <strong>${escapeHtml(opts.ticketKey)}</strong> mudou de `,
      `<code>${escapeHtml(opts.fromStatus)}</code> para `,
      `<code>${escapeHtml(opts.toStatus)}</code>.</p>`,
      `<p><a href="${escapeHtml(ticketUrl)}">Abrir chamado</a></p>`,
    ].join(""),
    organizationId: opts.organizationId,
  });
}

export async function sendTicketCommentEmail(opts: {
  to: string;
  ticketKey: string;
  preview: string;
  organizationId: string;
}): Promise<MailResult> {
  const base =
    process.env.APP_PUBLIC_URL?.replace(/\/$/, "") ?? "http://localhost:5173";
  const ticketUrl = `${base}/tickets/${encodeURIComponent(opts.ticketKey)}`;
  const text = [
    `Nova resposta no chamado ${opts.ticketKey}.`,
    opts.preview,
    `Ver: ${ticketUrl}`,
  ].join("\n");

  return sendMail({
    to: opts.to,
    subject: `Chamado ${opts.ticketKey}: nova resposta`,
    text,
    html: [
      `<p>Nova resposta no chamado <strong>${escapeHtml(opts.ticketKey)}</strong>.</p>`,
      `<p>${escapeHtml(opts.preview)}</p>`,
      `<p><a href="${escapeHtml(ticketUrl)}">Abrir chamado</a></p>`,
    ].join(""),
    organizationId: opts.organizationId,
  });
}

export async function sendTestEmail(opts: {
  to: string;
  organizationId: string;
}): Promise<MailResult> {
  const text = [
    "Este é um e-mail de teste das configurações de comunicação da sua consultoria.",
    "Se você recebeu esta mensagem, o envio e o reply-to estão configurados corretamente.",
  ].join("\n");

  return sendMail({
    to: opts.to,
    subject: "Teste de e-mail — SpecDriven Platform",
    text,
    html: `<p>${escapeHtml(text).replace(/\n/g, "</p><p>")}</p>`,
    organizationId: opts.organizationId,
  });
}

export async function sendPasswordResetEmail(opts: {
  to: string;
  name: string;
  resetUrl: string;
  organizationId: string;
}): Promise<MailResult> {
  const text = [
    `Olá ${opts.name},`,
    "",
    "Recebemos um pedido para redefinir sua senha.",
    `Acesse: ${opts.resetUrl}`,
    "",
    "O link expira em 1 hora. Se não foi você, ignore este e-mail.",
  ].join("\n");

  return sendMail({
    to: opts.to,
    subject: "Redefinir senha — SpecDriven",
    text,
    html: [
      `<p>Olá <strong>${escapeHtml(opts.name)}</strong>,</p>`,
      `<p>Recebemos um pedido para redefinir sua senha.</p>`,
      `<p><a href="${escapeHtml(opts.resetUrl)}">Redefinir senha</a></p>`,
      `<p style="color:#666;font-size:12px">O link expira em 1 hora.</p>`,
    ].join(""),
    organizationId: opts.organizationId,
  });
}

export async function sendCsatFeedbackEmail(opts: {
  to: string;
  ticketKey: string;
  organizationId: string;
}): Promise<MailResult> {
  const base =
    process.env.APP_PUBLIC_URL?.replace(/\/$/, "") ?? "http://localhost:5173";
  const feedbackUrl = `${base}/tickets/${encodeURIComponent(opts.ticketKey)}/feedback`;
  const text = [
    `Seu chamado ${opts.ticketKey} foi concluído!`,
    `Por favor, avalie nosso atendimento: ${feedbackUrl}`,
  ].join("\n");

  return sendMail({
    to: opts.to,
    subject: `Avalie o atendimento do chamado ${opts.ticketKey}`,
    text,
    html: [
      `<p>Seu chamado <strong>${escapeHtml(opts.ticketKey)}</strong> foi concluído!</p>`,
      `<p>Por favor, clique no link abaixo para avaliar nosso atendimento:</p>`,
      `<p><a href="${escapeHtml(feedbackUrl)}">Avaliar atendimento</a></p>`,
    ].join(""),
    organizationId: opts.organizationId,
  });
}

