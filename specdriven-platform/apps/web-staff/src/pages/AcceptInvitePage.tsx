import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { acceptInvite, ApiError } from "../lib/api";

function inviteErrorMessage(err: ApiError): string {
  const code = (err.body as { error?: string } | null)?.error;
  switch (code) {
    case "invite_not_found":
      return "Convite não encontrado. Verifique o link do e-mail.";
    case "invite_already_accepted":
      return "Este convite já foi aceito. Faça login.";
    case "invite_expired":
      return "Este convite expirou. Peça um novo convite.";
    case "user_already_exists":
      return "Já existe uma conta com este e-mail. Faça login.";
    case "invalid_body":
      return "Dados inválidos. Nome e senha (mín. 8 caracteres) são obrigatórios.";
    default:
      return err.message;
  }
}

export function AcceptInvitePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tokenFromUrl = searchParams.get("token") ?? "";

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    tokenFromUrl ? null : "Link inválido: token ausente.",
  );
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!tokenFromUrl) return;

    setError(null);
    setSubmitting(true);
    try {
      await acceptInvite({
        token: tokenFromUrl,
        name: name.trim(),
        password,
      });
      navigate("/login", {
        replace: true,
        state: { message: "Conta criada. Faça login com seu e-mail e senha." },
      });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(inviteErrorMessage(err));
      } else {
        setError("Falha ao conectar na API. Verifique se ela está no ar.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="panel login-panel">
        <p className="page-eyebrow" style={{ marginBottom: "0.5rem" }}>
          Portal consultoria
        </p>
        <h1>SpecDriven</h1>
        <p className="lead">Aceitar convite — crie sua conta no portal da consultoria.</p>
        <form className="form" onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="name">Nome</label>
            <input
              id="name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={!tokenFromUrl}
            />
          </div>
          <div className="field">
            <label htmlFor="password">Senha</label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
              disabled={!tokenFromUrl}
            />
          </div>
          {error ? <p className="error">{error}</p> : null}
          <button
            className="btn"
            type="submit"
            disabled={submitting || !tokenFromUrl}
          >
            {submitting ? "Criando conta…" : "Aceitar convite"}
          </button>
        </form>
        <p className="muted" style={{ marginTop: "1rem", fontSize: "0.8rem" }}>
          Já tem conta? <Link to="/login">Entrar</Link>
        </p>
      </div>
    </div>
  );
}
