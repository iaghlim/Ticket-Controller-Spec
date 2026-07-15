import { useEffect, useState } from "react";
import { usePortalSettings } from "../lib/usePortalSettings";

export interface KnowledgeArticle {
  id: string;
  title: string;
  body: string;
  isVisibleToClient: boolean;
  status: "draft" | "published";
  problemId: string | null;
  updatedAt: string;
}

const INITIAL_ARTICLES: KnowledgeArticle[] = [
  {
    id: "kb-1",
    title: "Como redefinir sua senha de acesso",
    body: "# Redefinição de Senha\n\nSe você esqueceu sua senha, siga o passo a passo abaixo:\n\n1. Acesse a tela de login.\n2. Clique em **Esqueceu a senha?**.\n3. Digite seu e-mail cadastrado.\n4. Siga as instruções enviadas para o seu e-mail.\n\n*Nota: O link expira em 24 horas.*",
    isVisibleToClient: true,
    status: "published",
    problemId: null,
    updatedAt: new Date().toISOString(),
  },
  {
    id: "kb-3",
    title: "Guia de Abertura de Chamados Eficiente",
    body: "# Como abrir chamados eficientes\n\nAo abrir um chamado, inclua sempre:\n\n- **Título claro**: Descreva o problema de forma concisa.\n- **Passo a passo**: O que você estava fazendo quando o erro ocorreu?\n- **Evidências**: Anexe capturas de tela ou logs se disponíveis.\n\nIsso agiliza o tempo de resposta e resolução do time de suporte.",
    isVisibleToClient: true,
    status: "published",
    problemId: null,
    updatedAt: new Date().toISOString(),
  },
];

export function KnowledgePage() {
  const { settings: portalSettings } = usePortalSettings();
  const [articles, setArticles] = useState<KnowledgeArticle[]>([]);
  const [selectedArticle, setSelectedArticle] = useState<KnowledgeArticle | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load articles from localStorage
    const saved = localStorage.getItem("specdriven.knowledge_articles");
    let loaded: KnowledgeArticle[] = [];
    if (saved) {
      try {
        loaded = JSON.parse(saved);
      } catch (err) {
        console.error("Erro ao ler localStorage de artigos, utilizando defaults", err);
        loaded = INITIAL_ARTICLES;
      }
    } else {
      loaded = INITIAL_ARTICLES;
    }

    // Filter only published and visible to client
    const clientVisible = loaded.filter(
      (art) => art.status === "published" && art.isVisibleToClient === true
    );

    setArticles(clientVisible);
    if (clientVisible.length > 0) {
      setSelectedArticle(clientVisible[0]!);
    }
    setLoading(false);
  }, []);

  function renderMarkdown(text: string) {
    if (!text) return null;
    const lines = text.split("\n");
    return lines.map((line, idx) => {
      if (line.startsWith("# ")) {
        return (
          <h1 key={idx} style={{ fontSize: "1.75rem", fontWeight: "bold", margin: "1.25rem 0 0.75rem", borderBottom: "1px solid #eaeaea", paddingBottom: "0.5rem", color: "#111" }}>
            {line.slice(2)}
          </h1>
        );
      }
      if (line.startsWith("## ")) {
        return (
          <h2 key={idx} style={{ fontSize: "1.4rem", fontWeight: "bold", margin: "1.25rem 0 0.75rem", color: "#222" }}>
            {line.slice(3)}
          </h2>
        );
      }
      if (line.startsWith("### ")) {
        return (
          <h3 key={idx} style={{ fontSize: "1.2rem", fontWeight: "bold", margin: "1.1rem 0 0.5rem", color: "#333" }}>
            {line.slice(4)}
          </h3>
        );
      }
      if (line.startsWith("- ") || line.startsWith("* ")) {
        return (
          <li key={idx} style={{ marginLeft: "1.5rem", listStyleType: "disc", margin: "0.25rem 0", color: "#444" }}>
            {line.slice(2)}
          </li>
        );
      }
      // Simple bold/italic formatting
      let content: React.ReactNode = line;
      if (line.includes("**")) {
        const parts = line.split("**");
        content = parts.map((part, pIdx) => (pIdx % 2 === 1 ? <strong key={pIdx}>{part}</strong> : part));
      }
      return (
        <p key={idx} style={{ margin: "0.75rem 0", lineHeight: "1.6", color: "#444" }}>
          {content}
        </p>
      );
    });
  }

  const filteredArticles = articles.filter(
    (art) =>
      art.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      art.body.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // If KB is disabled in settings, show a fallback message
  if (portalSettings && !portalSettings.knowledgeBaseEnabled) {
    return (
      <div className="container-lg" style={{ padding: "2rem", textAlign: "center" }}>
        <h2>Base de Conhecimento desativada</h2>
        <p className="muted">Este recurso não está habilitado para esta organização.</p>
      </div>
    );
  }

  return (
    <div className="container-lg">
      <div style={{ marginBottom: "1.5rem" }}>
        <h1>Base de Conhecimento</h1>
        <p className="muted">Busque e leia artigos de suporte da nossa consultoria</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: "1.5rem", alignItems: "start" }}>
        {/* Left column: Search and list */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div className="panel" style={{ padding: "1rem" }}>
            <input
              type="text"
              placeholder="Buscar artigos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: "100%", padding: "0.5rem", border: "1px solid #ccc", borderRadius: "4px" }}
            />
          </div>

          <div className="panel" style={{ padding: "0.5rem", maxHeight: "600px", overflowY: "auto" }}>
            {loading ? (
              <p className="muted" style={{ padding: "1rem" }}>Carregando artigos...</p>
            ) : filteredArticles.length === 0 ? (
              <p className="muted" style={{ padding: "1rem" }}>Nenhum artigo encontrado.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {filteredArticles.map((art) => (
                  <button
                    key={art.id}
                    onClick={() => setSelectedArticle(art)}
                    style={{
                      textAlign: "left",
                      padding: "0.75rem 1rem",
                      border: "none",
                      background: selectedArticle?.id === art.id ? "var(--bg-accent, #e5f1ff)" : "transparent",
                      color: selectedArticle?.id === art.id ? "var(--accent, #0056b3)" : "inherit",
                      fontWeight: selectedArticle?.id === art.id ? "bold" : "normal",
                      borderRadius: "4px",
                      cursor: "pointer",
                      width: "100%",
                      transition: "background 0.2s",
                    }}
                  >
                    {art.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column: Details view */}
        <div className="panel" style={{ padding: "2rem", minHeight: "450px" }}>
          {selectedArticle ? (
            <div>
              <div style={{ borderBottom: "2px solid #f0f0f0", paddingBottom: "1rem", marginBottom: "1.5rem" }}>
                <h2 style={{ fontSize: "2rem", margin: "0 0 0.5rem 0", color: "#111" }}>{selectedArticle.title}</h2>
                <div className="muted" style={{ fontSize: "0.85rem" }}>
                  Última atualização em: {new Date(selectedArticle.updatedAt).toLocaleDateString("pt-BR")} às {new Date(selectedArticle.updatedAt).toLocaleTimeString("pt-BR")}
                </div>
              </div>
              <div className="rich-text-content">
                {renderMarkdown(selectedArticle.body)}
              </div>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "4rem 0", color: "#aaa" }}>
              <span style={{ fontSize: "3rem" }}>📖</span>
              <p style={{ marginTop: "1rem" }}>Selecione um artigo na lista para visualizar seus detalhes.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
