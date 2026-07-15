import { useEffect, useState } from "react";
import { listProblems, type Problem } from "../lib/api";

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
    id: "kb-2",
    title: "Configurando VPN da Consultoria",
    body: "# VPN Corporativa\n\nEste guia descreve como configurar a VPN para acesso interno:\n\n- Baixe o cliente OpenVPN.\n- Importe o arquivo de perfil enviado pelo gestor.\n- Conecte utilizando suas credenciais corporativas.\n\nEm caso de dúvidas, abra um chamado da categoria **Dúvida**.",
    isVisibleToClient: false,
    status: "draft",
    problemId: null,
    updatedAt: new Date().toISOString(),
  },
];

export function KnowledgePage() {
  const [articles, setArticles] = useState<KnowledgeArticle[]>([]);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Editor form state
  const [showEditor, setShowEditor] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formBody, setFormBody] = useState("");
  const [formIsVisible, setFormIsVisible] = useState(true);
  const [formStatus, setFormStatus] = useState<"draft" | "published">("published");
  const [formProblemId, setFormProblemId] = useState<string>("");

  useEffect(() => {
    // Load problems
    listProblems()
      .then((res) => setProblems(res))
      .catch((err) => console.error("Erro ao carregar problemas:", err));

    // Load articles from localStorage
    const saved = localStorage.getItem("specdriven.knowledge_articles");
    if (saved) {
      try {
        setArticles(JSON.parse(saved));
      } catch (err) {
        console.error("Erro ao ler localStorage de artigos, utilizando defaults", err);
        setArticles(INITIAL_ARTICLES);
        localStorage.setItem("specdriven.knowledge_articles", JSON.stringify(INITIAL_ARTICLES));
      }
    } else {
      setArticles(INITIAL_ARTICLES);
      localStorage.setItem("specdriven.knowledge_articles", JSON.stringify(INITIAL_ARTICLES));
    }
    setLoading(false);
  }, []);

  function saveToLocalStorage(updatedList: KnowledgeArticle[]) {
    setArticles(updatedList);
    localStorage.setItem("specdriven.knowledge_articles", JSON.stringify(updatedList));
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!formTitle.trim() || !formBody.trim()) {
      setError("Título e corpo do artigo são obrigatórios.");
      return;
    }

    setError(null);
    let updatedList: KnowledgeArticle[];

    if (editingId) {
      updatedList = articles.map((art) =>
        art.id === editingId
          ? {
              ...art,
              title: formTitle.trim(),
              body: formBody,
              isVisibleToClient: formIsVisible,
              status: formStatus,
              problemId: formProblemId || null,
              updatedAt: new Date().toISOString(),
            }
          : art
      );
    } else {
      const newArticle: KnowledgeArticle = {
        id: `kb-${Date.now()}`,
        title: formTitle.trim(),
        body: formBody,
        isVisibleToClient: formIsVisible,
        status: formStatus,
        problemId: formProblemId || null,
        updatedAt: new Date().toISOString(),
      };
      updatedList = [newArticle, ...articles];
    }

    saveToLocalStorage(updatedList);
    resetForm();
  }

  function handleEdit(art: KnowledgeArticle) {
    setEditingId(art.id);
    setFormTitle(art.title);
    setFormBody(art.body);
    setFormIsVisible(art.isVisibleToClient);
    setFormStatus(art.status);
    setFormProblemId(art.problemId || "");
    setShowEditor(true);
    setError(null);
  }

  function handleDelete(id: string) {
    if (!window.confirm("Deseja realmente excluir este artigo?")) return;
    const updatedList = articles.filter((art) => art.id !== id);
    saveToLocalStorage(updatedList);
    if (editingId === id) {
      resetForm();
    }
  }

  function resetForm() {
    setEditingId(null);
    setFormTitle("");
    setFormBody("");
    setFormIsVisible(true);
    setFormStatus("published");
    setFormProblemId("");
    setShowEditor(false);
    setError(null);
  }

  function renderMarkdown(text: string) {
    if (!text) return <p className="muted">Nenhum conteúdo para visualizar.</p>;
    const lines = text.split("\n");
    return lines.map((line, idx) => {
      if (line.startsWith("# ")) {
        return (
          <h1 key={idx} style={{ fontSize: "1.5rem", fontWeight: "bold", margin: "1rem 0 0.5rem", borderBottom: "1px solid #eaeaea", paddingBottom: "0.25rem" }}>
            {line.slice(2)}
          </h1>
        );
      }
      if (line.startsWith("## ")) {
        return (
          <h2 key={idx} style={{ fontSize: "1.25rem", fontWeight: "bold", margin: "1rem 0 0.5rem" }}>
            {line.slice(3)}
          </h2>
        );
      }
      if (line.startsWith("### ")) {
        return (
          <h3 key={idx} style={{ fontSize: "1.1rem", fontWeight: "bold", margin: "1rem 0 0.5rem" }}>
            {line.slice(4)}
          </h3>
        );
      }
      if (line.startsWith("- ") || line.startsWith("* ")) {
        return (
          <li key={idx} style={{ marginLeft: "1.5rem", listStyleType: "disc", margin: "0.25rem 0" }}>
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
        <p key={idx} style={{ margin: "0.5rem 0" }}>
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

  return (
    <div className="container-lg">
      <div className="flex-head">
        <div>
          <h1>Base de Conhecimento</h1>
          <p className="muted">Gerencie artigos de ajuda, guias de suporte e documentação interna/externa</p>
        </div>
        {!showEditor && (
          <button className="btn" onClick={() => setShowEditor(true)}>
            Novo Artigo
          </button>
        )}
      </div>

      {showEditor && (
        <div className="panel panel-spaced" style={{ marginTop: "1rem" }}>
          <div className="panel-head" style={{ display: "flex", justifyContent: "between", alignItems: "center" }}>
            <h2>{editingId ? "Editar Artigo" : "Novo Artigo"}</h2>
            <button className="btn btn-ghost btn-sm" onClick={resetForm} style={{ marginLeft: "auto" }}>
              Cancelar
            </button>
          </div>

          {error && <div className="alert alert-error" style={{ marginBottom: "1rem" }}>{error}</div>}

          <form onSubmit={handleSave} className="form form-spaced">
            <div className="field">
              <label htmlFor="art-title">Título do Artigo *</label>
              <input
                id="art-title"
                type="text"
                required
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="Ex: Como configurar VPN corporativa"
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", marginTop: "1rem" }}>
              <div className="field">
                <label htmlFor="art-body">Corpo (Markdown simples) *</label>
                <textarea
                  id="art-body"
                  rows={12}
                  required
                  value={formBody}
                  onChange={(e) => setFormBody(e.target.value)}
                  placeholder="# Título Principal&#10;&#10;Use markdown básico como **negrito**, listas com hífen (- item) e cabeçalhos (# Título)."
                  style={{ fontFamily: "monospace", fontSize: "0.9rem" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "bold", marginBottom: "4px" }}>
                  Pré-visualização ao Vivo
                </label>
                <div
                  style={{
                    border: "1px solid #ccc",
                    borderRadius: "4px",
                    padding: "1rem",
                    height: "260px",
                    overflowY: "auto",
                    backgroundColor: "#f9f9f9",
                  }}
                >
                  {renderMarkdown(formBody)}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap", margin: "1rem 0" }}>
              <div className="field" style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem" }}>
                <input
                  id="art-visible"
                  type="checkbox"
                  checked={formIsVisible}
                  onChange={(e) => setFormIsVisible(e.target.checked)}
                />
                <label htmlFor="art-visible" style={{ marginBottom: 0, cursor: "pointer" }}>
                  Visível ao cliente
                </label>
              </div>

              <div className="field" style={{ minWidth: "150px" }}>
                <label htmlFor="art-status">Status</label>
                <select
                  id="art-status"
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value as "draft" | "published")}
                >
                  <option value="draft">Rascunho</option>
                  <option value="published">Publicado</option>
                </select>
              </div>

              <div className="field" style={{ flex: 1, minWidth: "200px" }}>
                <label htmlFor="art-problem">Vincular a um Problema (Opcional)</label>
                <select
                  id="art-problem"
                  value={formProblemId}
                  onChange={(e) => setFormProblemId(e.target.value)}
                >
                  <option value="">Nenhum problema selecionado</option>
                  {problems.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-actions" style={{ marginTop: "1rem" }}>
              <button className="btn" type="submit">
                {editingId ? "Salvar Alterações" : "Criar Artigo"}
              </button>
              <button className="btn btn-ghost" type="button" onClick={resetForm}>
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Busca */}
      <div className="panel" style={{ marginTop: "1rem" }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="kb-search">Buscar Artigos</label>
          <input
            id="kb-search"
            type="text"
            placeholder="Buscar por palavra-chave no título ou conteúdo..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem" }}>
          <span className="muted">Carregando base de conhecimento...</span>
        </div>
      ) : filteredArticles.length === 0 ? (
        <div className="panel text-center" style={{ padding: "3rem", marginTop: "1.5rem" }}>
          <span style={{ fontSize: "2rem" }}>📖</span>
          <h3 style={{ margin: "1rem 0 0.5rem" }}>Nenhum artigo encontrado</h3>
          <p className="muted" style={{ margin: 0 }}>
            Crie um novo artigo ou altere os termos da busca.
          </p>
        </div>
      ) : (
        <div className="panel" style={{ marginTop: "1.5rem", overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Título</th>
                <th>Status</th>
                <th>Visibilidade</th>
                <th>Problema Vinculado</th>
                <th>Última Atualização</th>
                <th style={{ width: "160px" }}></th>
              </tr>
            </thead>
            <tbody>
              {filteredArticles.map((art) => {
                const linkedProb = problems.find((p) => p.id === art.problemId);
                return (
                  <tr key={art.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{art.title}</div>
                      <div className="muted" style={{ fontSize: "0.85rem", maxHeight: "2.4em", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {art.body.substring(0, 100)}...
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${art.status === "published" ? "badge-success" : "badge-gray"}`}>
                        {art.status === "published" ? "Publicado" : "Rascunho"}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${art.isVisibleToClient ? "badge-blue" : "badge-warning"}`}>
                        {art.isVisibleToClient ? "Cliente & Staff" : "Apenas Staff"}
                      </span>
                    </td>
                    <td>
                      {linkedProb ? (
                        <span className="badge badge-purple" title={linkedProb.title}>
                          ⚠️ {linkedProb.title.substring(0, 25)}...
                        </span>
                      ) : (
                        <span className="muted" style={{ fontSize: "0.85rem" }}>Nenhum</span>
                      )}
                    </td>
                    <td>
                      <span className="muted" style={{ fontSize: "0.85rem" }}>
                        {new Date(art.updatedAt).toLocaleString("pt-BR")}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => handleEdit(art)}>
                          Editar
                        </button>
                        <button className="btn btn-ghost btn-sm" style={{ color: "red" }} onClick={() => handleDelete(art.id)}>
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
