import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") ?? "").trim();

    let query = supabase
      .from("tickets")
      .select(
        "id_ticket, ticket_title, status_name, category_name, tod_date"
      )
      // 🔹 SOLO TICKETS ACTIVOS
      .neq("status_name", "Resuelto a Tiempo")
      .neq("status_name", "Resuelto Fuera de Tiempo")
      .order("tod_date", { ascending: false })
      .limit(50);

    if (q) {
      query = query.or(
        `id_ticket.ilike.%${q}%,ticket_title.ilike.%${q}%`
      );
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ ok: true, data: data ?? [] });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Error" },
      { status: 500 }
    );
  }
}
