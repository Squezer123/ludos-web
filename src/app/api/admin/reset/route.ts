import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "../../../../db/client";
import { hasAdminSession } from "../../../../lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ ok: false, error: "Brak uprawnień administratora." }, { status: 401 });
  }

  try {
    const db = await getDb();
    // Usuwa wszystkie zaimportowane dane i historię importów, zachowując strukturę bazy.
    await db.execute(sql.raw(
      'TRUNCATE TABLE "exp_gains", "deaths", "fights", "gold_points", "events", "sessions", "characters", "imports" RESTART IDENTITY CASCADE'
    ));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Nie udało się wyzerować danych:", error);
    return NextResponse.json({ ok: false, error: "Nie udało się wyzerować danych." }, { status: 500 });
  }
}
