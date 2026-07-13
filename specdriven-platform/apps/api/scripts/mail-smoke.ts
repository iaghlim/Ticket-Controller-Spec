import {
  sendMail,
  sendInviteEmail,
  sendTicketStatusEmail,
} from "../src/mail.ts";

async function main() {
  delete process.env.MAIL_PROVIDER;
  const r1 = await sendMail({
    to: "smoke@example.com",
    subject: "smoke-log",
    text: "hello log",
  });
  console.log("LOG", r1);
  if (r1.provider !== "log" || !r1.delivered) {
    throw new Error("log smoke failed");
  }

  process.env.MAIL_PROVIDER = "smtp";
  process.env.SMTP_HOST = "127.0.0.1";
  process.env.SMTP_PORT = "1025";
  process.env.SMTP_SECURE = "false";
  process.env.MAIL_FROM = "noreply@specdriven.local";

  const r2 = await sendInviteEmail({
    to: "invite@example.com",
    role: "cliente",
    token: "smoke-token",
    expiresAt: new Date(Date.now() + 86_400_000),
  });
  console.log("SMTP_INVITE", r2);
  if (r2.provider !== "smtp" || !r2.delivered) {
    throw new Error(`smtp invite smoke failed: ${JSON.stringify(r2)}`);
  }

  const r3 = await sendTicketStatusEmail({
    to: "status@example.com",
    ticketKey: "DEMO-1",
    fromStatus: "backlog",
    toStatus: "em_andamento",
  });
  console.log("SMTP_STATUS", r3);
  if (r3.provider !== "smtp" || !r3.delivered) {
    throw new Error(`smtp status smoke failed: ${JSON.stringify(r3)}`);
  }

  console.log("SMOKE_OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
