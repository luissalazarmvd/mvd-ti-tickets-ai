// app/api/feedback/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { rating, comment } = body ?? {};

    if (
      typeof rating !== "number" ||
      rating < 1 ||
      rating > 10
    ) {
      return NextResponse.json(
        { ok: false, error: "Valoración inválida (1–10)." },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("ti_feedback")
      .insert([
        {
          rating,
          comment: comment?.trim() || null,
        },
      ]);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Error" },
      { status: 500 }
    );
  }
}
