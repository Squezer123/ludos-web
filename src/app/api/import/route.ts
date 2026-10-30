import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { importSavedVariables } from "../../../lib/import";
import { hasAdminSession } from "../../../lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 25 * 1024 * 1024;

function tokenMatches(given: string, required: string): boolean {
  const a = Buffer.from(given, "utf8");
  const b = Buffer.from(required, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json(
      { ok: false, error: "Oczekiwano formularza z plikiem." },
      { status: 400 },
    );
  }

  // Uploader desktopowy może uwierzytelnić się tokenem UPLOAD_TOKEN.
  // Jeśli token nie jest skonfigurowany lub jest nieprawidłowy, wymagamy sesji administratora.
  const required = process.env.UPLOAD_TOKEN;
  const given = req.headers.get("x-upload-token") ?? String(form.get("token") ?? "");
  const validUploadToken = Boolean(required && given && tokenMatches(given, required));
  const validAdminSession = await hasAdminSession();

  if (!validUploadToken && !validAdminSession) {
    if (required && given) {
      return NextResponse.json(
        { ok: false, error: "Błędny token wgrywania." },
        { status: 401 },
      );
    }
    return NextResponse.json(
      { ok: false, error: "Wymagane logowanie administratora lub prawidłowy token uploadu." },
      { status: 401 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Brak pliku." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { ok: false, error: "Plik jest za duży (limit 25 MB)." },
      { status: 413 },
    );
  }

  try {
    const label = String(form.get("label") ?? "") || null;
    const result = await importSavedVariables(await file.text(), label);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Nieznany błąd importu.";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
