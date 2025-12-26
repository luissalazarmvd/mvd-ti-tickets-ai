import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type Body = { id_ticket: string };

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createClient(url, key, { auth: { persistSession: false } });
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

    // 1) Ticket actual
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

    // 2) Históricos relevantes (mismo criterio)
    const { data: hist, error: e2 } = await supabase
      .from("tickets")
      .select(
        "id_ticket, category_name, ticket_title, ticket_detail, ticket_res_note, ticket_cause, sla_res_minu, res_val, res_val_note, res_val_class, res_date"
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

    // 3) Prompt (JSON)
    const system = `
Eres un analista senior de soporte TI (ITSM). Tu trabajo: proponer una solución accionable y segura
basándote en el ticket actual y tickets históricos resueltos.

Reglas:
- No inventes acciones que requieran permisos no mencionados.
- Si falta información, indica EXACTAMENTE qué falta y cómo pedirla.
- Prioriza: (1) restaurar servicio rápido, (2) evitar recurrencia, (3) buena experiencia del usuario.
- Usa los históricos como evidencia: cita IDs de tickets usados.
- Devuelve SOLO JSON válido según el schema.
`.trim();

    const user = `
TICKET ACTUAL:
${JSON.stringify(currentTicket)}

HISTÓRICOS RELEVANTES (misma categoría):
${JSON.stringify(historyTickets)}
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
        tickets_historicos_usados: { type: "array", items: { type: "string" } },
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

    // 4) OpenAI Responses API (JSON schema correcto: text.format)
    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5.1-mini",
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
      return NextResponse.json(
        { ok: false, error: `OpenAI error: ${t}` },
        { status: 500 }
      );
    }

    const out = await resp.json();

    // En Responses API, lo más directo es output_text cuando pides texto/JSON en text.format
    const text = out?.output_text ?? null;

    if (!text) {
      return NextResponse.json(
        { ok: false, error: "No se obtuvo output_text del modelo" },
        { status: 500 }
      );
    }

    // output_text debe ser un JSON string válido por el schema
    const parsed = JSON.parse(text);

    return NextResponse.json({ ok: true, data: parsed });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Error" },
      { status: 500 }
    );
  }
}
