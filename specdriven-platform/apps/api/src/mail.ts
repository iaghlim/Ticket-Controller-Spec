/**
 * Transactional mail — configurable provider.
 * - `log` (default): stub — prints to stdout (dev sem SMTP).
 * - `smtp`: nodemailer → SMTP_HOST/PORT (ex.: Mailpit local).
 */

import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type MailResult = {
  provider: string;
  delivered: boolean;
  messageId?: string;
  error?: string;
};

let smtpTransporter: Transporter | null = null;

function mailProvider(): string {
  return (process.env.MAIL_PROVIDER ?? "log").toLowerCase();
}

function mailFrom(): string {
  return process.env.MAIL_FROM ?? "noreply@specdriven.local";
}

function getSmtpTransporter(): Transporter {
  if (smtpTransporter) return smtpTransporter;

  const host = process.env.SMTP_HOST?.trim();
  if (!host) {
    throw new Error("SMTP_HOST is required when MAIL_PROVIDER=smtp");
  }

  const port = Number(process.env.SMTP_PORT ?? "587");
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`Invalid SMTP_PORT: ${process.env.SMTP_PORT}`);
  }

  const user = process.env.SMTP_USER?.trim();
  smtpTransporter = nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE === "true",
    auth: user
      ? { user, pass: process.env.SMTP_PASS ?? "" }
      : undefined,
  });
  return smtpTransporter;
}

async function sendViaLog(message: MailMessage): Promise<MailResult> {
  const messageId = `log-${Date.now()}`;
  console.info("[mail:log]", {
    messageId,
    to: message.to,
    subject: message.subject,
    text: message.text,
  });
  return { provider: "log", delivered: true, messageId };
}

export async function sendMail(message: MailMessage): Promise<MailResult> {
  const provider = mailProvider();

  if (provider === "smtp") {
    try {
      const transport = getSmtpTransporter();
      const info = await transport.sendMail({
        from: mailFrom(),
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      console.info("[mail:smtp]", {
        messageId: info.messageId,
        to: message.to,
        subject: message.subject,
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
      const fallback = await sendViaLog(message);
      return { ...fallback, error };
    }
  }

  if (provider !== "log") {
    console.warn(
      `[mail] unknown MAIL_PROVIDER=${provider} — using log stub`,
    );
  }

  return sendViaLog(message);
}

export async function sendInviteEmail(opts: {
  to: string;
  role: string;
  token: string;
  expiresAt: Date;
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
  });
}

export async function sendTicketStatusEmail(opts: {
  to: string;
  ticketKey: string;
  fromStatus: string;
  toStatus: string;
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
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
