# Checklist go-live — SpecDriven Platform

Marque cada item antes de abrir para clientes reais. Ordem recomendada: P0.1 → P0.4.

---

## P0.1 — Secrets + SMTP

- [ ] Brevo: gerar **nova** chave SMTP; revogar chave antiga se vazou
- [ ] Remetente verificado no Brevo (`MAIL_FROM`)
- [ ] `.env` local com `MAIL_PROVIDER=smtp` + credenciais Brevo
- [ ] API reiniciada
- [ ] Staff → Configurações → E-mail → **e-mail de teste** recebido
- [ ] Convite real enviado e recebido
- [ ] Repositório GitHub **Private**
- [ ] `.env` não versionado (só `.env.example` / `.env.production.example`)

**Done:** e-mails na caixa, não só log da API.

---

## P0.2 — Storage (anexos)

- [ ] `S3_ENDPOINT` e credenciais no `.env` prod
- [ ] Compose com `--profile storage` (MinIO)
- [ ] Bucket `specdriven` criado (init automático ou console MinIO)
- [ ] Upload de anexo no chamado (cliente ou staff)
- [ ] Download do anexo funciona
- [ ] `/health` → `storage: ok`

**Done:** anexo binário real, sem aviso “só metadados”.

---

## P0.3 — Deploy VPS + TLS

- [ ] VPS com Docker instalado
- [ ] `cp .env.production.example .env` preenchido:
  - [ ] `NODE_ENV=production`
  - [ ] `JWT_SECRET` ≥ 32 caracteres
  - [ ] `CORS_ORIGINS` = URLs HTTPS dos portais
  - [ ] `APP_PUBLIC_URL` = portal cliente HTTPS
  - [ ] Brevo SMTP
  - [ ] S3 / MinIO
- [ ] `npm run db:migrate:deploy` (**sem** `db:seed`)
- [ ] `docker compose -f docker-compose.prod.yml --profile storage up -d`
- [ ] Caddy/Nginx com TLS (ver `docker/Caddyfile`)
- [ ] `curl https://api.../health` → ok
- [ ] Login com usuário criado manualmente (não seed)

**Done:** portais em HTTPS, produção sem credenciais demo.

---

## P0.4 — Smoke E2E

- [ ] Gestor/admin: `/settings` — perfil + e-mail + catálogo completos
- [ ] Convidar cliente → e-mail → `/accept-invite` → login cliente
- [ ] Cliente: novo chamado (tipo/módulo do catálogo) + anexo
- [ ] Staff: comentário **público** → cliente notificado (sino/e-mail)
- [ ] Staff: mudança de status → e-mail status
- [ ] `/settings/sla` feriado + meta; baseline **não** no portal cliente
- [ ] Reset de senha: esqueci senha → e-mail → nova senha → login

**Done:** fluxo 1–7 verde; bugs críticos corrigidos.

---

## P1 — Pós go-live (código no repo)

- [x] Reset / troca de senha (API + portais)
- [x] `master` em `canManageSettings`
- [x] Audit UI (`/settings/audit`)
- [x] Privacidade LGPD UI (`/settings/privacy`)
- [x] Projects UI (`/settings/projects`)
- [x] Testes smoke API (`npm run test`)
- [x] E2E Playwright login (`npm run test:e2e`)
- [x] Auth httpOnly cookies (documentado em `docs/security.md` — JWT em localStorage)

---

## P2 — Backlog

- [x] Logo org (upload S3) + header cliente
- [x] Tags visíveis ao cliente (`visibleToClient`)
- [x] `/settings/users` → gestão de convites
- [x] SMTP por consultoria (`/settings/email`)
- [x] Job recalcular SLA em massa (`/settings/sla`)
- [x] Hero customizável (`/settings/portal`)

---

## Comandos úteis

```powershell
cd specdriven-platform
docker compose up -d
npm run db:migrate:deploy
npm run db:seed          # só local
.\scripts\validate-go-live.ps1
.\scripts\smoke-health.ps1
.\scripts\deploy-prod.sh # VPS Linux
npm run test             # smoke API
npm run test:e2e         # Playwright staff login
```

Ver também: [infra-producao.md](../specdriven-platform/docs/infra-producao.md), [settings.md](settings.md).
