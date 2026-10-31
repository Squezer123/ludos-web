import { timingSafeEqual } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { asc, eq, lt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "../../../../db/client";
import { importUploadChunks } from "../../../../db/schema";
import { hasAdminSession } from "../../../../lib/admin-auth";
import { importSavedVariables } from "../../../../lib/import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CHUNKS = 250;
const MAX_CHUNK_BYTES = 700 * 1024;

function tokenMatches(given: string, required: string): boolean {
  const a = Buffer.from(given, "utf8");
  const b = Buffer.from(required, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

async function authorized(req: Request) {
  const required = process.env.UPLOAD_TOKEN;
  const given = req.headers.get("x-upload-token") ?? "";
  const validToken = Boolean(required && given && tokenMatches(given, required));
  return validToken || await hasAdminSession();
}

export async function POST(req: Request) {
  if (!(await authorized(req))) {
    return NextResponse.json({ ok: false, error: "Wymagane logowanie administratora lub prawidłowy token uploadu." }, { status: 401 });
  }

  const action = req.headers.get("x-ludos-action");
  const uploadId = req.headers.get("x-ludos-upload-id") ?? "";
  if (!/^[a-f0-9-]{20,80}$/i.test(uploadId)) {
    return NextResponse.json({ ok: false, error: "Nieprawidłowy identyfikator importu." }, { status: 400 });
  }

  const db = await getDb();
  try {
    // Usuwaj stare, porzucone porcje, aby nie gromadzić ich bez końca.
    await db.delete(importUploadChunks).where(lt(importUploadChunks.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000)));

    if (action === "chunk") {
      const index = Number(req.headers.get("x-ludos-chunk-index"));
      const total = Number(req.headers.get("x-ludos-total-chunks"));
      const filename = decodeURIComponent(req.headers.get("x-ludos-filename") ?? "LUDOS-on.lua").slice(0, 250);
      const data = Buffer.from(await req.arrayBuffer());
      if (!Number.isInteger(index) || !Number.isInteger(total) || total < 1 || total > MAX_CHUNKS || index < 0 || index >= total) {
        return NextResponse.json({ ok: false, error: "Nieprawidłowe parametry porcji." }, { status: 400 });
      }
      if (data.length === 0 || data.length > MAX_CHUNK_BYTES) {
        return NextResponse.json({ ok: false, error: "Porcja ma nieprawidłowy rozmiar." }, { status: 413 });
      }
      const existing = await db.select({ totalChunks: importUploadChunks.totalChunks }).from(importUploadChunks).where(eq(importUploadChunks.uploadId, uploadId)).limit(1);
      if (existing.length && existing[0].totalChunks !== total) {
        return NextResponse.json({ ok: false, error: "Liczba porcji nie zgadza się z rozpoczętym importem." }, { status: 409 });
      }
      await db.insert(importUploadChunks).values({ uploadId, chunkIndex: index, totalChunks: total, filename, data }).onConflictDoUpdate({
        target: [importUploadChunks.uploadId, importUploadChunks.chunkIndex],
        set: { data, filename, totalChunks: total, createdAt: new Date() },
      });
      return NextResponse.json({ ok: true, received: index + 1, total });
    }

    if (action === "complete") {
      const parts = await db.select().from(importUploadChunks).where(eq(importUploadChunks.uploadId, uploadId)).orderBy(asc(importUploadChunks.chunkIndex));
      if (!parts.length || parts.length !== parts[0].totalChunks || parts.some((p, i) => p.chunkIndex !== i)) {
        return NextResponse.json({ ok: false, error: "Brakuje części pliku. Ponów import." }, { status: 409 });
      }
      // Limit wielkości pojedynczej porcji jest sprawdzany przy uploadzie.
      // Nie ograniczamy łącznego rozmiaru do 100 MB; pamiętaj jednak, że
      // buforowanie całości i gunzipSync nadal wymagają pamięci proporcjonalnej do pliku.
      const compressed = Buffer.concat(parts.map((p) => Buffer.from(p.data)));
      const filename = parts[0].filename;
      const unpacked = gunzipSync(compressed);
      const text = unpacked.toString("utf8");
      const result = await importSavedVariables(text, filename);
      await db.delete(importUploadChunks).where(eq(importUploadChunks.uploadId, uploadId));
      return NextResponse.json({ ok: true, ...result });
    }

    if (action === "cancel") {
      await db.delete(importUploadChunks).where(eq(importUploadChunks.uploadId, uploadId));
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: "Nieznana operacja importu." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nie udało się przetworzyć importu.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
