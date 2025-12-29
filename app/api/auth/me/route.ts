import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const role = req.cookies.get("mvdti_session")?.value;

  if (role !== "ti" && role !== "jefes") {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  return NextResponse.json({ ok: true, role });
}
