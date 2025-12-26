import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

type Body = { id_ticket: string };

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
    const body = (await req.json()) as Body;
    const id_ticket = (body?.id_ticket ?? "").trim();
    if (!id_ticket) {
      return NextResponse.json({ ok: false, error: "Falta id_ticket" }, { status: 400 });
    }

    // 1) Ticket actual
    const { data: cur, error: e1 } = await supabase
      .from("tickets")
      .select("*")
      .eq("id_ticket", id_ticket)
      .maybeSingle();

    if (e1) throw e1;
    if (!cur) {
      return NextResponse.json({ ok: false, error: "Ticket no encontrado" }, { status: 404 });
    }

    // 2) Históricos relevantes (simple MVP):
    // - misma categoría
    // - resuelto (res_date not null)
    // - con nota de resolución o causa
    // - prioriza mejor calificación y menor SLA de resolución
    const { data: hist, error: e2 } = await supabase
      .from("tickets")
      .select("id_ticket, category_name, ticket_title, ticket_detail, ticket_res_note, ticket_cause, sla_res_minu, res_val, res_val_note, res_val_class, res_date")
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

    // 3) Prompt + salida estructurada (JSON)
    const system = `
Eres un analista senior de soporte TI (ITSM). Tu trabajo: proponer una solución accionable y segura
basándote en el ticket actual y tickets históricos resueltos.

Reglas:
- No inventes acciones que requieran permisos no mencionados.
- Si falta información, indica EXACTAMENTE qué falta y cómo pedirla.
- Prioriza: (1) restaurar servicio rápido, (2) evitar recurrencia, (3) buena experiencia del usuario.
- Usa los históricos solo como evidencia: cita IDs de tickets usados.
Devuelve SOLO JSON válido según el schema.
`.trim();

    const user = `
TICKET ACTUAL:
${JSON.stringify(currentTicket, null, 2)}

HISTÓRICOS RELEVANTES (misma categoría):
${JSON.stringify(historyTickets, null, 2)}
`.trim();

    // OpenAI Responses API
    // Modelo recomendado por costo/calidad: gpt-5-mini
    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        input: [
          { role: "system", content: [{ type: "text", text: system }] },
          { role: "user", content: [{ type: "text", text: user }] },
        ],
        // Para respuestas consistentes
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "ticket_insight",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                resumen: { type: "string" },
                diagnostico_probable: { type: "string" },
                pasos_sugeridos: {
                  type: "array",
                  items: { type: "string" },
                },
                preguntas_para_aclarar: {
                  type: "array",
                  items: { type: "string" },
                },
                riesgos_y_precauciones: {
                  type: "array",
                  items: { type: "string" },
                },
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
            },
          },
        },
      }),
    });

    if (!resp.ok) {
      const t = await resp.text();
      return NextResponse.json({ ok: false, error: `OpenAI error: ${t}` }, { status: 500 });
    }

    const out = await resp.json();

    // Responses API devuelve contenido; acá lo leemos como JSON string del output
    // Dependiendo del SDK, puede variar; con fetch suele venir:
    // out.output[...].content[...].text
    const text =
      out?.output?.[0]?.content?.find((c: any) => c.type === "output_text")?.text ??
      out?.output_text ??
      null;

    if (!text) {
      return NextResponse.json({ ok: false, error: "No se obtuvo respuesta del modelo" }, { status: 500 });
    }

    const parsed = JSON.parse(text);

    return NextResponse.json({ ok: true, data: parsed });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Error" },
      { status: 500 }
    );
  }
}