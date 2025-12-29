import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const cookieStore = await cookies();
  const role = cookieStore.get("mvdti_session")?.value;

  if (role !== "ti" && role !== "jefes") {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  return NextResponse.json({ ok: true, role });
}
