import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOW_DOMAINS = [
  "learn.microsoft.com",
  "support.microsoft.com",
  "docs.microsoft.com",
  "cisco.com",
  "fortinet.com",
  "paloaltonetworks.com",
  "dell.com",
  "hp.com",
  "lenovo.com",
  "logitech.com",
  "intel.com",
  "amd.com",
];

function getBraveKey() {
  const k = process.env.BRAVE_SEARCH_API_KEY;
  if (!k) throw new Error("Missing BRAVE_SEARCH_API_KEY.");
  return k;
}

function hostFromUrl(u: string) {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isAllowed(url: string) {
  const host = hostFromUrl(url);
  if (!host) return false;
  return ALLOW_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") ?? "").trim();

    if (!q) return NextResponse.json({ ok: true, data: [] });

    const BRAVE_KEY = getBraveKey();

    // Query con allowlist (Brave soporta site:)
    // Nota: Brave entiende OR sin paréntesis también, pero así es más claro.
    const siteFilter = ALLOW_DOMAINS.map((d) => `site:${d}`).join(" OR ");
    const query = `(${siteFilter}) ${q}`.slice(0, 450);

    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(
      query
    )}&count=8&search_lang=es`;

    const r = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": BRAVE_KEY,
      },
      cache: "no-store",
    });

    if (!r.ok) {
      const t = await r.text();

      // Rate limit típico
      if (r.status === 429) {
        return NextResponse.json(
          { ok: false, error: "Brave rate limit (429). Reintenta en ~1s." },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { ok: false, error: `Brave error (${r.status}): ${t}` },
        { status: 500 }
      );
    }

    const json = await r.json();

    // Brave: json.web.results = [{ title, url, description, ... }]
    const results = (json?.web?.results ?? []) as Array<any>;

    const data = results
      .map((x) => {
        const url = String(x?.url ?? "");
        return {
          title: String(x?.title ?? "").trim(),
          url,
          snippet: String(x?.description ?? "").trim(),
          host: hostFromUrl(url),
        };
      })
      .filter((x) => x.url && isAllowed(x.url))
      .slice(0, 3);

    return NextResponse.json({ ok: true, data });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Error" },
      { status: 500 }
    );
  }
}
