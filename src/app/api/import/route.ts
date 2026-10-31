import { timingSafeEqual } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { NextResponse } from "next/server";
import { importSavedVariables } from "../../../lib/import";
import { hasAdminSession } from "../../../lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 100 * 1024 * 1024;

function tokenMatches(given: string, required: string): boolean {
  const a = Buffer.from(given, "utf8");
  const b = Buffer.from(required, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  const compressed = req.headers.get("x-ludos-compressed") === "gzip";

  // Dla nowego uploadu token jest przesyłany w nagłówku, więc nie musimy
  // parsować całego pliku przed sprawdzeniem uprawnień.
  let form: FormData | null = null;
  const required = process.env.UPLOAD_TOKEN;
  let given = req.headers.get("x-upload-token") ?? "";

  if (!compressed) {
    form = await req.formData().catch(() => null);
    if (!form) {
      return NextResponse.json(
        { ok: false, error: "Oczekiwano formularza z plikiem." },
        { status: 400 },
      );
    }
    if (!given) given = String(form.get("token") ?? "");
  }

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

  try {
    let text: string;
    let label: string | null = null;

    if (compressed) {
      const raw = Buffer.from(await req.arrayBuffer());
      if (raw.byteLength > 4 * 1024 * 1024) {
        return NextResponse.json(
          { ok: false, error: "Skompresowany plik nadal przekracza limit żądania Vercel. Potrzebny będzie import porcjowany lub magazyn plików." },
          { status: 413 },
        );
      }
      const unpacked = gunzipSync(raw, { maxOutputLength: MAX_BYTES });
      if (unpacked.byteLength > MAX_BYTES) {
        return NextResponse.json(
          { ok: false, error: "Rozpakowany plik przekracza limit 100 MB." },
          { status: 413 },
        );
      }
      text = unpacked.toString("utf8");
      const filename = req.headers.get("x-ludos-filename");
      label = filename ? decodeURIComponent(filename) : null;
    } else {
      const file = form?.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ ok: false, error: "Brak pliku." }, { status: 400 });
      }
      if (file.size > MAX_BYTES) {
        return NextResponse.json(
          { ok: false, error: "Plik jest za duży (limit 100 MB)." },
          { status: 413 },
        );
      }
      text = await file.text();
      label = String(form?.get("label") ?? "") || null;
    }

    const result = await importSavedVariables(text, label);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Nieznany błąd importu.";
    const tooLarge = /maxOutputLength|larger than|buffer too large/i.test(msg);
    return NextResponse.json(
      { ok: false, error: tooLarge ? "Rozpakowany plik przekracza limit 100 MB." : msg },
      { status: tooLarge ? 413 : 400 },
    );
  }
}
