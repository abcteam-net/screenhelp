import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { baseUrl?: string };
  const baseUrl = (body.baseUrl || "http://localhost:8787").replace(/\/$/, "");

  try {
    const healthRes = await fetch(`${baseUrl}/health`, { cache: "no-store" });
    if (!healthRes.ok) {
      return NextResponse.json(
        { ok: false, error: `health HTTP ${healthRes.status}` },
        { status: 502 },
      );
    }

    const health = (await healthRes.json().catch(() => ({}))) as { version?: string };
    const tokenRes = await fetch(`${baseUrl}/token`, { cache: "no-store" });
    if (!tokenRes.ok) {
      return NextResponse.json(
        { ok: false, error: `token HTTP ${tokenRes.status}` },
        { status: 502 },
      );
    }

    const token = (await tokenRes.json().catch(() => ({}))) as { token?: string };
    if (!token.token) {
      return NextResponse.json(
        { ok: false, error: "bridge returned no token" },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true, version: health.version || "?" });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error:
          `Can't reach bridge at ${baseUrl} from the web server. ` +
          `Start the bridge on the same machine as the web server. (${e?.message || e})`,
      },
      { status: 502 },
    );
  }
}
