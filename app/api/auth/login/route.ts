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

    // Determinar rol
    let role: "ti" | "jefes" | null = null;
    if (x === pTI) role = "ti";
    else if (x === pJ) role = "jefes";

    if (!role) {
      return NextResponse.json({ ok: false, error: "Clave incorrecta." }, { status: 401 });
    }

    // Respuesta + cookie httpOnly
    const res = NextResponse.json({ ok: true, role });

    res.cookies.set({
      name: "mvdti_session",
      value: role,
      httpOnly: true,
      secure: true,      // en Vercel (https) OK
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 8, // 8 horas
    });

    return res;
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }
}
