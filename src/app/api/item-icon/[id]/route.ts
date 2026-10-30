import { NextResponse } from "next/server";

export const revalidate = 86400;

/** Pobiera nazwę ikony z publicznego endpointu tooltipów Wowhead. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{1,10}$/.test(id)) {
    return NextResponse.json({ error: "Nieprawidłowe ID przedmiotu" }, { status: 400 });
  }

  try {
    const response = await fetch(`https://nether.wowhead.com/tooltip/item/${id}?dataEnv=1&locale=0`, {
      headers: { Accept: "application/json", "User-Agent": "LudosWeb/1.0" },
      next: { revalidate: 86400 },
    });
    if (!response.ok) return NextResponse.json({ icon: null }, { status: 200 });
    const payload: unknown = await response.json();
    const icon = payload && typeof payload === "object" && "icon" in payload
      ? (payload as { icon?: unknown }).icon
      : null;
    return NextResponse.json({ icon: typeof icon === "string" && /^[a-z0-9_]+$/i.test(icon) ? icon : null }, {
      headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
    });
  } catch {
    return NextResponse.json({ icon: null }, { status: 200 });
  }
}
