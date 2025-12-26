"use client";

import { useEffect, useMemo, useState } from "react";

const PASS_TI = "MVDTI_123";
const PASS_JEFES = "MVDJeFeS_123";

const PBI_TI =
  "https://app.powerbi.com/view?r=eyJrIjoiZWZiNzE2YzctNDA4Ni00M2UyLWExNzktM2Q4ZTAxMTk2OTdjIiwidCI6IjYzNzhiZmNkLWRjYjktNDMwZi05Nzc4LWRiNTk3NGRjMmFkYyIsImMiOjR9";

const PBI_JEFES =
  "https://app.powerbi.com/view?r=eyJrIjoiNDQ2MTZmZjUtNTBmZC00Mjg2LWI4N2ItMjMzNWFkOWFiYzVmIiwidCI6IjYzNzhiZmNkLWRjYjktNDMwZi05Nzc4LWRiNTk3NGRjMmFkYyIsImMiOjR9";

type TicketOption = {
  id_ticket: string;
  ticket_title: string | null;
  status_name: string | null;
  category_name: string | null;
  tod_date: string | null;
};

type Insight = {
  resumen: string;
  diagnostico_probable: string;
  pasos_sugeridos: string[];
  preguntas_para_aclarar: string[];
  riesgos_y_precauciones: string[];
  tickets_historicos_usados: string[];
  confianza: number;
};

export default function Home() {
  const [authorized, setAuthorized] = useState(false);
  const [role, setRole] = useState<"ti" | "jefes" | null>(null);

  const [input, setInput] = useState("");
  const [error, setError] = useState("");

  // Selector tickets
  const [q, setQ] = useState("");
  const [options, setOptions] = useState<TicketOption[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);

  const [selected, setSelected] = useState<TicketOption | null>(null);

  // Insight
  const [loadingInsight, setLoadingInsight] = useState(false);
  const [insight, setInsight] = useState<Insight | null>(null);
  const [insightError, setInsightError] = useState<string>("");

  const pbiUrl = useMemo(() => {
    if (role === "ti") return PBI_TI;
    if (role === "jefes") return PBI_JEFES;
    return null;
  }, [role]);

  // Mantener sesión
  useEffect(() => {
    try {
      const saved = localStorage.getItem("mvdti_auth_role");
      if (saved === "ti" || saved === "jefes") {
        setAuthorized(true);
        setRole(saved);
      }
    } catch {}
  }, []);

  const login = () => {
    const pass = input.trim();
    if (pass === PASS_TI) {
      setAuthorized(true);
      setRole("ti");
      setError("");
      try {
        localStorage.setItem("mvdti_auth_role", "ti");
      } catch {}
      return;
    }
    if (pass === PASS_JEFES) {
      setAuthorized(true);
      setRole("jefes");
      setError("");
      try {
        localStorage.setItem("mvdti_auth_role", "jefes");
      } catch {}
      return;
    }
    setError("Clave incorrecta.");
  };

  const logout = () => {
    setAuthorized(false);
    setRole(null);
    setInput("");
    setError("");
    setSelected(null);
    setOptions([]);
    setInsight(null);
    setInsightError("");
    try {
      localStorage.removeItem("mvdti_auth_role");
    } catch {}
  };

  // Buscar tickets (debounce simple)
  useEffect(() => {
    if (!authorized) return;
    const handle = setTimeout(async () => {
      setLoadingTickets(true);
      try {
        const res = await fetch(`/api/tickets?q=${encodeURIComponent(q)}`);
        const js = await res.json();
        if (!js.ok) throw new Error(js.error ?? "Error");
        setOptions(js.data ?? []);
      } catch (e: any) {
        // no mates la UI por esto
        setOptions([]);
      } finally {
        setLoadingTickets(false);
      }
    }, 350);

    return () => clearTimeout(handle);
  }, [q, authorized]);

  const generateInsight = async () => {
    setInsight(null);
    setInsightError("");
    if (!selected?.id_ticket) {
      setInsightError("Selecciona un ticket primero.");
      return;
    }
    setLoadingInsight(true);
    try {
      const res = await fetch("/api/ai/insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_ticket: selected.id_ticket }),
      });
      const js = await res.json();
      if (!js.ok) throw new Error(js.error ?? "Error IA");
      setInsight(js.data as Insight);
    } catch (e: any) {
      setInsightError(e?.message ?? "Error IA");
    } finally {
      setLoadingInsight(false);
    }
  };

  if (!authorized) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
        <div style={{ width: 420, maxWidth: "100%", padding: 24, borderRadius: 16, border: "1px solid #2a2a2a" }}>
          <h1 style={{ margin: 0, fontSize: 22 }}>MVD TI</h1>
          <p style={{ marginTop: 8, opacity: 0.8 }}>Ingresa la clave para ver el dashboard.</p>

          <input
            type="password"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Clave"
            style={{ width: "100%", padding: 12, borderRadius: 10, border: "1px solid #333", background: "transparent", color: "inherit" }}
            onKeyDown={(e) => {
              if (e.key === "Enter") login();
            }}
          />

          {error ? <div style={{ marginTop: 10, color: "#ff6b6b" }}>{error}</div> : null}

          <button
            onClick={login}
            style={{ marginTop: 14, width: "100%", padding: 12, borderRadius: 10, border: "1px solid #333", cursor: "pointer" }}
          >
            Entrar
          </button>
        </div>
      </main>
    );
  }

  return (
    <main style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 600 }}>Seguimiento Tickets TI</div>
          <div style={{ opacity: 0.75, fontSize: 12 }}>
            Rol: {role === "ti" ? "Responsable TI" : "Jefatura"} · Power BI + Copiloto
          </div>
        </div>

        <button onClick={logout} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #333", cursor: "pointer" }}>
          Salir
        </button>
      </div>

      {/* Power BI */}
      {pbiUrl ? (
        <div style={{ width: "100%", height: "72vh", borderRadius: 16, overflow: "hidden", border: "1px solid #2a2a2a" }}>
          <iframe
            title="Power BI"
            src={pbiUrl}
            width="100%"
            height="100%"
            style={{ border: "none" }}
            allowFullScreen
          />
        </div>
      ) : null}

      {/* Copiloto TI */}
      <div style={{ marginTop: 14, padding: 16, borderRadius: 16, border: "1px solid #2a2a2a" }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Copiloto TI</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "start" }}>
          <div>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar ticket por ID o título..."
              style={{ width: "100%", padding: 12, borderRadius: 10, border: "1px solid #333", background: "transparent", color: "inherit" }}
            />

            <div style={{ marginTop: 10, border: "1px solid #333", borderRadius: 10, overflow: "hidden" }}>
              <div style={{ padding: "8px 10px", fontSize: 12, opacity: 0.8, borderBottom: "1px solid #333" }}>
                {loadingTickets ? "Buscando..." : "Resultados (elige uno)"}
              </div>

              <div style={{ maxHeight: 220, overflow: "auto" }}>
                {options.length === 0 ? (
                  <div style={{ padding: 10, opacity: 0.7, fontSize: 12 }}>No hay resultados.</div>
                ) : (
                  options.map((t) => {
                    const active = selected?.id_ticket === t.id_ticket;
                    return (
                      <button
                        key={t.id_ticket}
                        onClick={() => setSelected(t)}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          padding: 10,
                          border: "none",
                          borderTop: "1px solid #2a2a2a",
                          background: active ? "rgba(255,255,255,0.06)" : "transparent",
                          color: "inherit",
                          cursor: "pointer",
                        }}
                      >
                        <div style={{ fontWeight: 600, fontSize: 13 }}>
                          {t.id_ticket} <span style={{ opacity: 0.7, fontWeight: 400 }}>· {t.status_name ?? "—"}</span>
                        </div>
                        <div style={{ opacity: 0.75, fontSize: 12 }}>{t.ticket_title ?? ""}</div>
                        <div style={{ opacity: 0.6, fontSize: 11 }}>{t.category_name ?? ""}</div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {selected ? (
              <div style={{ marginTop: 10, padding: 10, borderRadius: 10, border: "1px dashed #333", fontSize: 12, opacity: 0.85 }}>
                Seleccionado: <b>{selected.id_ticket}</b> — {selected.ticket_title ?? ""}
              </div>
            ) : null}
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            <button
              onClick={generateInsight}
              disabled={loadingInsight}
              style={{
                padding: "12px 14px",
                borderRadius: 10,
                border: "1px solid #333",
                cursor: "pointer",
                opacity: loadingInsight ? 0.7 : 1,
              }}
            >
              {loadingInsight ? "Generando..." : "Generar insight"}
            </button>

            <div style={{ fontSize: 12, opacity: 0.7, width: 260 }}>
              La respuesta usa el ticket actual + históricos resueltos (misma categoría) para sugerir pasos y riesgos.
            </div>
          </div>
        </div>

        {insightError ? <div style={{ marginTop: 12, color: "#ff6b6b" }}>{insightError}</div> : null}

        {insight ? (
          <div style={{ marginTop: 12, padding: 12, borderRadius: 12, border: "1px solid #333" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <div style={{ fontWeight: 700 }}>Insight</div>
              <div style={{ fontSize: 12, opacity: 0.75 }}>Confianza: {(insight.confianza * 100).toFixed(0)}%</div>
            </div>

            <div style={{ marginTop: 8 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Resumen</div>
              <div style={{ opacity: 0.9 }}>{insight.resumen}</div>
            </div>

            <div style={{ marginTop: 10 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Diagnóstico probable</div>
              <div style={{ opacity: 0.9 }}>{insight.diagnostico_probable}</div>
            </div>

            <div style={{ marginTop: 10 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Pasos sugeridos</div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {insight.pasos_sugeridos.map((x, i) => (
                  <li key={i} style={{ marginBottom: 6, opacity: 0.95 }}>{x}</li>
                ))}
              </ul>
            </div>

            {insight.preguntas_para_aclarar?.length ? (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Preguntas para aclarar</div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {insight.preguntas_para_aclarar.map((x, i) => (
                    <li key={i} style={{ marginBottom: 6, opacity: 0.95 }}>{x}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {insight.riesgos_y_precauciones?.length ? (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Riesgos y precauciones</div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {insight.riesgos_y_precauciones.map((x, i) => (
                    <li key={i} style={{ marginBottom: 6, opacity: 0.95 }}>{x}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {insight.tickets_historicos_usados?.length ? (
              <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
                Históricos usados: {insight.tickets_historicos_usados.join(", ")}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </main>
  );
}
