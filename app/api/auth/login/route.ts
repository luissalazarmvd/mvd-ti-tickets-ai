// app/api/auth/login/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { pass } = await req.json();

    const pTI = process.env.PASS_TI;
    const pJ = process.env.PASS_JEFES;

    if (!pTI || !pJ) {
      return NextResponse.json({ ok: false, error: "Missing env vars." }, { status: 500 });
    }

    const x = String(pass ?? "").trim();

    if (x === pTI) return NextResponse.json({ ok: true, role: "ti" });
    if (x === pJ) return NextResponse.json({ ok: true, role: "jefes" });

    return NextResponse.json({ ok: false, error: "Clave incorrecta." }, { status: 401 });
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }
}
