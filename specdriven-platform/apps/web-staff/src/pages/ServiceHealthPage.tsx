import { useEffect, useState } from "react";
import { type Client, type Project } from "@specdriven/shared";
import {
  ApiError,
  listClients,
  listProjects,
  getServiceHealth,
  getTrendsReport,
  type ServiceHealthMetrics,
  type TrendPoint,
  apiBaseUrl,
  getStoredToken,
} from "../lib/api";

export function ServiceHealthPage() {
  const [period, setPeriod] = useState<string>("current_month");
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [metrics, setMetrics] = useState<ServiceHealthMetrics | null>(null);
  const [trends, setTrends] = useState<TrendPoint[]>([]);
  
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Load clients list for the selector
  useEffect(() => {
    let active = true;
    async function fetchClients() {
      try {
        const res = await listClients();
        if (active) {
          setClients(res.clients);
        }
      } catch (err) {
        console.error("Erro ao carregar clientes", err);
      }
    }
    void fetchClients();
    return () => {
      active = false;
    };
  }, []);

  // Fetch projects list when selectedClientId changes
  useEffect(() => {
    let active = true;
    async function fetchProjects() {
      try {
        const res = await listProjects(selectedClientId || undefined);
        if (active) {
          setProjects(res.projects);
          setSelectedProjectId(""); // Reset selected project filter on client change
        }
      } catch (err) {
        console.error("Erro ao carregar projetos", err);
      }
    }
    void fetchProjects();
    return () => {
      active = false;
    };
  }, [selectedClientId]);

  // Fetch metrics and trends when period, clientId, or projectId changes
  useEffect(() => {
    let active = true;
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const [healthData, trendsData] = await Promise.all([
          getServiceHealth(period, selectedClientId || undefined, selectedProjectId || undefined),
          getTrendsReport(selectedProjectId || undefined),
        ]);

        if (active) {
          setMetrics(healthData);
          setTrends(trendsData.trends);
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof ApiError
              ? err.message
              : "Não foi possível carregar os dados de saúde do serviço."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }
    void fetchData();
    return () => {
      active = false;
    };
  }, [period, selectedClientId, selectedProjectId]);

  // Export CSV
  const handleExportCsv = async () => {
    try {
      const auth = getStoredToken();
      const params = new URLSearchParams();
      params.set("period", period);
      if (selectedClientId) params.set("clientId", selectedClientId);
      if (selectedProjectId) params.set("projectId", selectedProjectId);

      const response = await fetch(
        `${apiBaseUrl}/reports/service-health.csv?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${auth}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("Falha ao exportar CSV");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `saude-do-servico-${period}${selectedClientId ? `-${selectedClientId}` : ""}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("Erro ao exportar o relatório CSV.");
    }
  };

  const handlePrintPdf = () => {
    window.print();
  };

  // Helper for formatting minutes to a human-friendly format
  const formatMinutes = (mins: number | null): string => {
    if (mins === null || mins === undefined) return "--";
    if (mins < 60) return `${Math.round(mins)} min`;
    const hrs = Math.floor(mins / 60);
    const remaining = Math.round(mins % 60);
    return remaining > 0 ? `${hrs}h ${remaining}m` : `${hrs}h`;
  };

  // SVG Line Chart Component
  const renderLineChart = (
    data: { label: string; value: number }[],
    strokeColor: string,
    fillId: string,
    gradientColors: [string, string],
    unit: string = ""
  ) => {
    if (data.length === 0) return <p className="empty">Sem dados históricos.</p>;
    
    const width = 500;
    const height = 180;
    const paddingX = 40;
    const paddingY = 20;
    const chartWidth = width - 2 * paddingX;
    const chartHeight = height - 2 * paddingY;
    
    const maxVal = Math.max(...data.map(d => d.value), 1);
    
    const points = data.map((d, idx) => {
      const x = paddingX + (idx / Math.max(data.length - 1, 1)) * chartWidth;
      const y = height - paddingY - (d.value / maxVal) * chartHeight;
      return { x, y, label: d.label, val: d.value };
    });
    
    const pathD = `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(" ");
    const fillD = `${pathD} L ${points[points.length - 1].x} ${height - paddingY} L ${points[0].x} ${height - paddingY} Z`;
    
    return (
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} style={{ overflow: "visible" }}>
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={gradientColors[0]} stopOpacity="0.25" />
            <stop offset="100%" stopColor={gradientColors[1]} stopOpacity="0.0" />
          </linearGradient>
        </defs>
        
        {/* Horizontal grid lines */}
        {[0, 0.5, 1].map((ratio, idx) => {
          const y = height - paddingY - ratio * chartHeight;
          const gridVal = Math.round(ratio * maxVal);
          return (
            <g key={idx}>
              <line x1={paddingX} y1={y} x2={width - paddingX} y2={y} stroke="var(--border)" strokeDasharray="3,3" />
              <text x={paddingX - 8} y={y + 4} textAnchor="end" fontSize="9" fill="var(--muted)" fontFamily="var(--mono)">
                {gridVal}
                {unit}
              </text>
            </g>
          );
        })}
        
        {/* Area fill */}
        <path d={fillD} fill={`url(#${fillId})`} />
        
        {/* Stroke path */}
        <path d={pathD} fill="none" stroke={strokeColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        
        {/* Data points */}
        {points.map((p, idx) => (
          <g key={idx} className="chart-dot">
            <circle cx={p.x} cy={p.y} r="4" fill="#fff" stroke={strokeColor} strokeWidth="2" />
            <title>{`${p.label}: ${p.val}${unit}`}</title>
          </g>
        ))}

        {/* X labels (only show 4 labels to avoid overlapping) */}
        {points.filter((_, i) => i % 3 === 0 || i === points.length - 1).map((p, idx) => (
          <text
            key={idx}
            x={p.x}
            y={height - 4}
            textAnchor="middle"
            fontSize="9"
            fill="var(--muted)"
            fontFamily="var(--mono)"
          >
            {p.label.split("-")[1]}/{p.label.split("-")[0].substring(2)}
          </text>
        ))}
      </svg>
    );
  };

  return (
    <>
      <style>{`
        @media print {
          .sidebar,
          .sidebar-overlay,
          .toolbar,
          .btn,
          button,
          .page-eyebrow,
          header,
          footer {
            display: none !important;
          }
          body {
            background: white !important;
            color: black !important;
            margin: 0 !important;
            padding: 1.5cm !important;
          }
          .app-layout {
            padding-left: 0 !important;
            margin: 0 !important;
          }
          .panel {
            border: 1px solid #ccc !important;
            box-shadow: none !important;
            background: white !important;
            page-break-inside: avoid;
            margin-bottom: 1.5rem !important;
          }
          .stats-row {
            display: grid !important;
            grid-template-columns: repeat(3, 1fr) !important;
            gap: 10px !important;
          }
          .stat {
            min-height: 90px !important;
            border: 1px solid #ccc !important;
          }
          .data-table th, .data-table td {
            padding: 6px !important;
          }
        }
      `}</style>

      <div className="page-head">
        <div>
          <p className="page-eyebrow">Relatórios</p>
          <h1 className="page-title-serif">Saúde do Serviço.</h1>
          <p>Visão de SLAs, eficiência operacional, aging de backlog, consumo de franquias e KPIs financeiros.</p>
        </div>
      </div>

      {/* Filter panel */}
      <div className="panel toolbar" style={{ marginBottom: "1.5rem", padding: "1.25rem" }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "1rem",
            alignItems: "flex-end",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
            <label className="field" style={{ margin: 0, minWidth: "140px" }}>
              <span className="muted" style={{ fontSize: "0.8rem", marginBottom: "4px" }}>
                Período
              </span>
              <select value={period} onChange={(e) => setPeriod(e.target.value)}>
                <option value="current_month">Mês Atual</option>
                <option value="previous_month">Mês Anterior</option>
                <option value="quarter">Trimestre Atual</option>
              </select>
            </label>

            <label className="field" style={{ margin: 0, minWidth: "180px" }}>
              <span className="muted" style={{ fontSize: "0.8rem", marginBottom: "4px" }}>
                Cliente
              </span>
              <select
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
              >
                <option value="">Todos os Clientes</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.code ? ` (${c.code})` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="field" style={{ margin: 0, minWidth: "180px" }}>
              <span className="muted" style={{ fontSize: "0.8rem", marginBottom: "4px" }}>
                Projeto
              </span>
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
              >
                <option value="">Todos os Projetos</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.code ? ` (${p.code})` : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              onClick={handlePrintPdf}
              className="btn btn-muted"
              style={{ display: "flex", alignItems: "center", gap: "0.5rem", height: "38px" }}
            >
              Exportar PDF
            </button>
            <button
              onClick={handleExportCsv}
              className="btn"
              style={{ display: "flex", alignItems: "center", gap: "0.5rem", height: "38px" }}
            >
              Exportar CSV
            </button>
          </div>
        </div>
      </div>

      {loading ? <p className="muted">Carregando dados…</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {!loading && !error && metrics ? (
        <>
          {/* KPIs Grid */}
          <div
            className="stats-row"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "1rem",
              marginBottom: "1.5rem",
            }}
          >
            <div
              className="stat panel"
              style={{
                padding: "1.25rem",
                margin: 0,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                minHeight: "120px",
              }}
            >
              <span
                className="stat-label muted"
                style={{ textTransform: "uppercase", fontSize: "0.75rem", fontWeight: 600 }}
              >
                MTTA (Resposta)
              </span>
              <strong className="stat-value" style={{ fontSize: "1.8rem", color: "var(--text)" }}>
                {formatMinutes(metrics.mtta)}
              </strong>
              <span className="muted" style={{ fontSize: "0.8rem", marginTop: "4px" }}>
                Tempo de resposta mediano
              </span>
            </div>

            <div
              className="stat panel"
              style={{
                padding: "1.25rem",
                margin: 0,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                minHeight: "120px",
              }}
            >
              <span
                className="stat-label muted"
                style={{ textTransform: "uppercase", fontSize: "0.75rem", fontWeight: 600 }}
              >
                MTTR (Resolução)
              </span>
              <strong className="stat-value" style={{ fontSize: "1.8rem", color: "var(--text)" }}>
                {formatMinutes(metrics.mttr)}
              </strong>
              <span className="muted" style={{ fontSize: "0.8rem", marginTop: "4px" }}>
                Tempo de resolução mediano
              </span>
            </div>

            <div
              className="stat panel"
              style={{
                padding: "1.25rem",
                margin: 0,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                minHeight: "120px",
              }}
            >
              <span
                className="stat-label muted"
                style={{ textTransform: "uppercase", fontSize: "0.75rem", fontWeight: 600 }}
              >
                FCR (Primeiro Contato)
              </span>
              <strong className="stat-value" style={{ fontSize: "1.8rem", color: "var(--text)" }}>
                {metrics.fcr !== null ? `${Math.round(metrics.fcr)}%` : "--"}
              </strong>
              <span className="muted" style={{ fontSize: "0.8rem", marginTop: "4px" }}>
                Resolvidos em primeiro contato
              </span>
            </div>

            <div
              className="stat panel"
              style={{
                padding: "1.25rem",
                margin: 0,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                minHeight: "120px",
              }}
            >
              <span
                className="stat-label muted"
                style={{ textTransform: "uppercase", fontSize: "0.75rem", fontWeight: 600 }}
              >
                Cumprimento SLA
              </span>
              <strong
                className="stat-value"
                style={{
                  fontSize: "1.8rem",
                  color:
                    metrics.slaPct !== null && metrics.slaPct < metrics.targetSlaPct
                      ? "var(--danger)"
                      : "var(--ok)",
                }}
              >
                {metrics.slaPct !== null ? `${Math.round(metrics.slaPct)}%` : "--"}
              </strong>
              <span className="muted" style={{ fontSize: "0.8rem", marginTop: "4px" }}>
                Meta acordada: {metrics.targetSlaPct}%
              </span>
            </div>

            <div
              className="stat panel"
              style={{
                padding: "1.25rem",
                margin: 0,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                minHeight: "120px",
              }}
            >
              <span
                className="stat-label muted"
                style={{ textTransform: "uppercase", fontSize: "0.75rem", fontWeight: 600 }}
              >
                Sucesso de Mudança
              </span>
              <strong className="stat-value" style={{ fontSize: "1.8rem", color: "var(--text)" }}>
                {metrics.changeSuccess.ticket !== null
                  ? `${Math.round(metrics.changeSuccess.ticket)}%`
                  : "100%"}
              </strong>
              <span className="muted" style={{ fontSize: "0.8rem", marginTop: "4px" }}>
                Taxa de aprovação de mudanças
              </span>
            </div>

            <div
              className="stat panel"
              style={{
                padding: "1.25rem",
                margin: 0,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                minHeight: "120px",
              }}
            >
              <span
                className="stat-label muted"
                style={{ textTransform: "uppercase", fontSize: "0.75rem", fontWeight: 600 }}
              >
                Baseline Burn
              </span>
              <strong
                className="stat-value"
                style={{
                  fontSize: "1.8rem",
                  color: metrics.baselineBurn > 100 ? "var(--danger)" : "var(--text)",
                }}
              >
                {metrics.baselineBurn}%
              </strong>
              <span className="muted" style={{ fontSize: "0.8rem", marginTop: "4px" }}>
                Consumo geral de franquia
              </span>
            </div>

            {/* Financial and Productivity KPIs */}
            <div
              className="stat panel"
              style={{
                padding: "1.25rem",
                margin: 0,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                minHeight: "120px",
              }}
            >
              <span
                className="stat-label muted"
                style={{ textTransform: "uppercase", fontSize: "0.75rem", fontWeight: 600 }}
              >
                Throughput (Produtividade)
              </span>
              <strong className="stat-value" style={{ fontSize: "1.8rem", color: "var(--text)" }}>
                {metrics.throughput !== undefined && metrics.throughput !== null
                  ? metrics.throughput
                  : trends.length > 0
                  ? trends[trends.length - 1].throughput
                  : 0}
              </strong>
              <span className="muted" style={{ fontSize: "0.8rem", marginTop: "4px" }}>
                Tickets concluídos no período
              </span>
            </div>

            <div
              className="stat panel"
              style={{
                padding: "1.25rem",
                margin: 0,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                minHeight: "120px",
              }}
            >
              <span
                className="stat-label muted"
                style={{ textTransform: "uppercase", fontSize: "0.75rem", fontWeight: 600 }}
              >
                Burn de Orçamento
              </span>
              <strong className="stat-value" style={{ fontSize: "1.8rem", color: "var(--text)" }}>
                {metrics.burnBudget !== undefined && metrics.burnBudget !== null
                  ? `${Math.round(metrics.burnBudget)}%`
                  : trends.length > 0
                  ? `${Math.round((trends[trends.length - 1].burnBudget / Math.max(trends[trends.length - 1].revenue, 1)) * 100)}%`
                  : "0%"}
              </strong>
              <span className="muted" style={{ fontSize: "0.8rem", marginTop: "4px" }}>
                Proporção consumida do orçamento
              </span>
            </div>

            <div
              className="stat panel"
              style={{
                padding: "1.25rem",
                margin: 0,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                minHeight: "120px",
              }}
            >
              <span
                className="stat-label muted"
                style={{ textTransform: "uppercase", fontSize: "0.75rem", fontWeight: 600 }}
              >
                Receita por Ticket
              </span>
              <strong className="stat-value" style={{ fontSize: "1.8rem", color: "var(--text)" }}>
                {metrics.revenuePerTicket !== undefined && metrics.revenuePerTicket !== null
                  ? `R$ ${metrics.revenuePerTicket.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                  : trends.length > 0 && trends[trends.length - 1].throughput > 0
                  ? `R$ ${(trends[trends.length - 1].revenue / trends[trends.length - 1].throughput).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                  : "R$ 150,00"}
              </strong>
              <span className="muted" style={{ fontSize: "0.8rem", marginTop: "4px" }}>
                Receita média faturada por ticket
              </span>
            </div>
          </div>

          {/* Trends Charts Section */}
          <div
            className="panel"
            style={{
              padding: "1.25rem",
              marginBottom: "1.5rem",
            }}
          >
            <div className="panel-head" style={{ marginBottom: "1rem" }}>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0 }}>
                Tendências Operacionais e Financeiras (Últimos 12 meses)
              </h2>
              <p className="muted" style={{ fontSize: "0.8rem", margin: "4px 0 0" }}>
                Histórico evolutivo de produtividade (throughput) e saúde financeira (receitas vs custos de budget).
              </p>
            </div>
            
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", marginTop: "1rem" }}>
              <div>
                <h4 style={{ margin: "0 0 0.5rem 0", fontSize: "0.9rem", color: "var(--muted)" }}>
                  Throughput Histórico (Tickets Resolvidos)
                </h4>
                {renderLineChart(
                  trends.map(t => ({ label: t.month, value: t.throughput })),
                  "var(--primary)",
                  "throughputGrad",
                  ["#bd1f2d", "#f7e7e8"]
                )}
              </div>
              <div>
                <h4 style={{ margin: "0 0 0.5rem 0", fontSize: "0.9rem", color: "var(--muted)" }}>
                  Faturamento & Burn de Custos (R$)
                </h4>
                {renderLineChart(
                  trends.map(t => ({ label: t.month, value: t.revenue })),
                  "var(--ok)",
                  "revenueGrad",
                  ["#3e5747", "#e8ece9"],
                  ""
                )}
                <div style={{ display: "flex", justifyContent: "center", gap: "1rem", marginTop: "4px", fontSize: "10px" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--ok)" }} />
                    Receitas Faturadas
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--primary)" }} />
                    Custos (Burn)
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom graphs and tables section */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))",
              gap: "1.5rem",
            }}
          >
            {/* Backlog Aging Chart */}
            <div className="panel" style={{ padding: "1.25rem" }}>
              <div className="panel-head" style={{ marginBottom: "1rem" }}>
                <h2 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0 }}>
                  Aging do Backlog (Chamados Ativos)
                </h2>
                <p className="muted" style={{ fontSize: "0.8rem", margin: "4px 0 0" }}>
                  Tempo de vida dos chamados atualmente sem conclusão.
                </p>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {Object.entries(metrics.aging).map(([bucket, count]) => {
                  const maxCount = Math.max(...Object.values(metrics.aging), 1);
                  const pct = (count / maxCount) * 100;
                  return (
                    <div
                      key={bucket}
                      style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: "0.85rem",
                        }}
                      >
                        <span style={{ fontWeight: 500 }}>{bucket}</span>
                        <span className="muted font-mono" style={{ fontFamily: "var(--mono)" }}>
                          {count} chamado(s)
                        </span>
                      </div>
                      <div
                        style={{
                          width: "100%",
                          height: "10px",
                          background: "var(--bg-muted)",
                          borderRadius: "9999px",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${pct}%`,
                            height: "100%",
                            background: "var(--primary)",
                            borderRadius: "9999px",
                            transition: "width 0.5s ease",
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Baseline Burn table */}
            <div className="panel" style={{ padding: "1.25rem" }}>
              <div className="panel-head" style={{ marginBottom: "1rem" }}>
                <h2 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0 }}>
                  Consumo de Baseline por Cliente
                </h2>
                <p className="muted" style={{ fontSize: "0.8rem", margin: "4px 0 0" }}>
                  Horas aprovadas em relação ao limite contratado no período selecionado.
                </p>
              </div>
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th style={{ textAlign: "right" }}>Contratado</th>
                      <th style={{ textAlign: "right" }}>Utilizado</th>
                      <th style={{ textAlign: "right" }}>% de Burn</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.baselineBurnTable.length === 0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="muted"
                          style={{ textAlign: "center", padding: "1.5rem" }}
                        >
                          Nenhum dado de baseline encontrado.
                        </td>
                      </tr>
                    ) : (
                      metrics.baselineBurnTable.map((row) => {
                        const badgeStyle: React.CSSProperties = {
                          background: "var(--ok-bg)",
                          color: "var(--ok)",
                          padding: "2px 8px",
                          borderRadius: "4px",
                          fontSize: "0.8rem",
                          fontWeight: 600,
                          display: "inline-block",
                        };
                        if (row.burnPct > 100) {
                          badgeStyle.background = "var(--primary-soft)";
                          badgeStyle.color = "var(--primary)";
                        } else if (row.burnPct >= 80) {
                          badgeStyle.background = "var(--warn-bg)";
                          badgeStyle.color = "var(--warn)";
                        }

                        return (
                          <tr key={row.clientId}>
                            <td style={{ fontWeight: 500 }}>{row.clientName}</td>
                            <td style={{ textAlign: "right" }}>
                              {row.hoursContracted ? `${row.hoursContracted}h` : "--"}
                            </td>
                            <td style={{ textAlign: "right" }}>{row.hoursUsed.toFixed(1)}h</td>
                            <td style={{ textAlign: "right" }}>
                              <span style={badgeStyle}>{row.burnPct}%</span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
