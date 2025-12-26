// app/api/ai/insight/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { id_ticket: string };

type WebSnippet = {
  title?: string;
  url?: string;
  snippet?: string;
};

// =========================
// Helpers
// =========================
function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

function getOpenAIKey() {
  const k = process.env.OPENAI_API_KEY;
  if (!k) throw new Error("Missing OPENAI_API_KEY.");
  return k;
}

function compactTicket(t: any) {
  return {
    id_ticket: t.id_ticket,
    category_name: t.category_name,
    status_name: t.status_name,
    site_name: t.site_name,
    staff_priority: t.staff_priority,
    tod_date: t.tod_date,
    create_date: t.create_date,
    start_date: t.start_date,
    res_date: t.res_date,
    sla_flag: t.sla_flag,
    sla_ate_minu: t.sla_ate_minu,
    sla_res_minu: t.sla_res_minu,
    sla_exp_minu: t.sla_exp_minu,
    ticket_title: t.ticket_title,
    ticket_detail: t.ticket_detail,
    staff_asigned: t.staff_asigned,
    staff_ti_head: t.staff_ti_head,
    origin_name: t.origin_name,
    ticket_res_note: t.ticket_res_note,
    ticket_cause: t.ticket_cause,
    res_val: t.res_val,
    res_val_note: t.res_val_note,
    res_val_class: t.res_val_class,
  };
}

function buildWebQuery(cur: any) {
  const cat = (cur?.category_name ?? "").toString().trim();
  const title = (cur?.ticket_title ?? "").toString().trim();
  const detail = (cur?.ticket_detail ?? "").toString().trim();

  // Mantén la query corta para que el search sea relevante.
  const shortDetail = detail.length > 220 ? detail.slice(0, 220) : detail;

  // Ejemplo: "M365 Outlook no sincroniza error 0x800..." etc.
  return [cat, title, shortDetail].filter(Boolean).join(" ");
}

async function fetchWebSnippets(origin: string, q: string): Promise<WebSnippet[]> {
  if (!q) return [];

  // Timeout corto para no trabar el insight
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const url = new URL("/api/web/search", origin);
    url.searchParams.set("q", q);

    const r = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });

    if (!r.ok) return [];

    const json = await r.json();
    const data = (json?.data ?? []) as WebSnippet[];

    // Limitar a 3 (si tu endpoint ya limita, igual lo reforzamos)
    return Array.isArray(data) ? data.slice(0, 3) : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

// =========================
// POST
// =========================
export async function POST(req: Request) {
  try {
    const supabase = getSupabase();
    const OPENAI_API_KEY = getOpenAIKey();

    const body = (await req.json()) as Body;
    const id_ticket = (body?.id_ticket ?? "").trim();

    if (!id_ticket) {
      return NextResponse.json(
        { ok: false, error: "Falta id_ticket" },
        { status: 400 }
      );
    }

    // Para llamar a tu propio /api/web/search desde server route:
    const origin = new URL(req.url).origin;

    // =========================
    // 1) Ticket actual
    // =========================
    const { data: cur, error: e1 } = await supabase
      .from("tickets")
      .select("*")
      .eq("id_ticket", id_ticket)
      .maybeSingle();

    if (e1) throw e1;
    if (!cur) {
      return NextResponse.json(
        { ok: false, error: "Ticket no encontrado" },
        { status: 404 }
      );
    }

    // =========================
    // 2) Históricos relevantes
    // =========================
    const { data: hist, error: e2 } = await supabase
      .from("tickets")
      .select(
        "id_ticket, ticket_title, ticket_detail, ticket_res_note, ticket_cause, sla_res_minu, res_val, res_val_note, res_val_class, res_date"
      )
      .eq("category_name", cur.category_name)
      .not("res_date", "is", null)
      .order("res_val", { ascending: false, nullsFirst: false })
      .order("sla_res_minu", { ascending: true, nullsFirst: false })
      .limit(20);

    if (e2) throw e2;

    const currentTicket = compactTicket(cur);
    const historyTickets = (hist ?? []).map((x) => ({
      id_ticket: x.id_ticket,
      ticket_title: x.ticket_title,
      ticket_detail: x.ticket_detail,
      ticket_res_note: x.ticket_res_note,
      ticket_cause: x.ticket_cause,
      sla_res_minu: x.sla_res_minu,
      res_val: x.res_val,
      res_val_note: x.res_val_note,
      res_val_class: x.res_val_class,
      res_date: x.res_date,
    }));

    // =========================
    // 2.5) Web snippets (secundario)
    // =========================
    const webQuery = buildWebQuery(cur);
    const webSnippets = await fetchWebSnippets(origin, webQuery);

    // =========================
    // 3) Prompt
    // =========================
    const system = `
Eres un analista senior de soporte TI (ITSM).
Propones una solución accionable basándote en el ticket actual y tickets históricos resueltos.
También puedes usar DOCUMENTACIÓN WEB (secundaria) si aporta.

Reglas:
- No inventes accesos ni permisos.
- Si falta información, indícalo explícitamente y di cómo pedirla.
- Prioriza: restaurar servicio, evitar recurrencia, experiencia del usuario.
- Cita IDs de tickets históricos usados.
- Si usas DOCUMENTACIÓN WEB, usa SOLO las URLs provistas (no inventes fuentes).
- Si hay conflicto entre históricos y web, prioriza históricos.
- Devuelve SOLO JSON válido según el schema.
`.trim();

    const user = `
TICKET ACTUAL:
${JSON.stringify(currentTicket, null, 2)}

HISTÓRICOS RELEVANTES:
${JSON.stringify(historyTickets, null, 2)}

DOCUMENTACIÓN WEB (secundaria; usar solo si aporta; citar URLs provistas):
${JSON.stringify(webSnippets, null, 2)}
`.trim();

    const schema = {
      type: "object",
      additionalProperties: false,
      properties: {
        resumen: { type: "string" },
        diagnostico_probable: { type: "string" },
        pasos_sugeridos: { type: "array", items: { type: "string" } },
        preguntas_para_aclarar: { type: "array", items: { type: "string" } },
        riesgos_y_precauciones: { type: "array", items: { type: "string" } },
        tickets_historicos_usados: {
          type: "array",
          items: { type: "string" },
        },
        confianza: { type: "number", minimum: 0, maximum: 1 },
      },
      required: [
        "resumen",
        "diagnostico_probable",
        "pasos_sugeridos",
        "preguntas_para_aclarar",
        "riesgos_y_precauciones",
        "tickets_historicos_usados",
        "confianza",
      ],
    };

    // =========================
    // 4) OpenAI Responses API
    // =========================
    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
      body: JSON.stringify({
        model: "gpt-5-mini",
        input: [
          { role: "system", content: [{ type: "input_text", text: system }] },
          { role: "user", content: [{ type: "input_text", text: user }] },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "ticket_insight",
            schema,
          },
        },
      }),
    });

    if (!resp.ok) {
      const t = await resp.text();

      // Rate limit típico
      if (resp.status === 429) {
        return NextResponse.json(
          { ok: false, error: "OpenAI rate limit (429). Reintenta en ~1s." },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { ok: false, error: `OpenAI error (${resp.status}): ${t}` },
        { status: 500 }
      );
    }

    const out = await resp.json();

    // =========================
    // 5) Extracción ROBUSTA del JSON
    // =========================
    let parsedJson: any = null;

    // 5.1) Buscar output_json explícito
    for (const block of out?.output ?? []) {
      for (const c of block.content ?? []) {
        if (c.type === "output_json" && c.json) {
          parsedJson = c.json;
          break;
        }
      }
      if (parsedJson) break;
    }

    // 5.2) Fallback: parsear output_text
    if (!parsedJson) {
      for (const block of out?.output ?? []) {
        for (const c of block.content ?? []) {
          if (c.type === "output_text" && typeof c.text === "string") {
            try {
              parsedJson = JSON.parse(c.text);
              break;
            } catch {
              // sigue buscando
            }
          }
        }
        if (parsedJson) break;
      }
    }

    if (!parsedJson) {
      console.error("OpenAI raw response:", JSON.stringify(out, null, 2));
      return NextResponse.json(
        { ok: false, error: "No se pudo extraer JSON del modelo" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      data: parsedJson,
      meta: {
        webQuery,
        webSnippetsUsed: webSnippets?.length ?? 0,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Error" },
      { status: 500 }
    );
  }
}
