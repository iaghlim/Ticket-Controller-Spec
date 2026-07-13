# Segurança — SpecDriven Platform

## Autenticação

- JWT HS256 em header `Authorization: Bearer` (12h TTL).
- Tokens armazenados em `localStorage` nos portais — **risco XSS**: scripts maliciosos podem roubar token. Mitigação futura: cookies `httpOnly` + `SameSite`.
- Produção: `JWT_SECRET` ≥ 32 caracteres; nunca `dev-only-change-me`.
- `DEV_AUTH_BYPASS` bloqueado quando `NODE_ENV=production`.

## Reset de senha

- `POST /auth/forgot-password` — resposta genérica (não revela se e-mail existe).
- Link válido 1h; token assinado com `JWT_SECRET`.
- Staff usa `APP_STAFF_URL` (default `http://localhost:5174`) no link.

## CORS

- Produção: `CORS_ORIGINS` obrigatório (whitelist de portais HTTPS).

## OpenAPI

- `/docs` desabilitado em produção salvo `OPENAPI_ENABLED` ou basic auth.

## Secrets

- Nunca commitar `.env`. Rotacionar chaves SMTP/API se vazarem.
- Seed `changeme` — **somente desenvolvimento**.

## Anexos e logo

- Upload via S3/MinIO; validar tamanho e MIME no servidor.
- Logo: máx. 2 MiB; PNG/JPEG/WebP.

## SMTP por consultoria (P2)

- Opcional em `/settings/email`: host, porta, usuário, senha e From próprios.
- Senha armazenada no Postgres — proteja backups e acesso ao banco.
- Quando `smtpEnabled`, e-mails da org usam o relay da consultoria; senão usa Brevo da plataforma.
