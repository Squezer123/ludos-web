"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type Result = { ok: true; duplicate: boolean; characters: number; sessions: number; eventsTotal: number; eventsNew: number; names: string[] } | { ok: false; error: string };

export function UploadForm({ tokenRequired }: { tokenRequired: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [token, setToken] = useState("");

  async function send(file: File) {
    setBusy(true);
    setResult(null);
    try {
      // Kompresja gzip znacznie zmniejsza pliki SavedVariables i pozwala
      // zmieścić się w limicie wielkości żądania platformy hostingowej.
      if (typeof CompressionStream === "undefined") {
        throw new Error("Ta przeglądarka nie obsługuje kompresji plików. Otwórz stronę w aktualnej wersji Chrome, Edge lub Firefox.");
      }
      const compressed = await new Response(
        file.stream().pipeThrough(new CompressionStream("gzip")),
      ).blob();

      if (compressed.size > 4 * 1024 * 1024) {
        throw new Error("Po kompresji plik nadal przekracza limit Vercel (około 4 MB). Dla tak dużych plików trzeba wdrożyć import porcjowany.");
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/gzip",
        "X-Ludos-Compressed": "gzip",
        "X-Ludos-Filename": encodeURIComponent(file.name),
      };
      if (token) headers["X-Upload-Token"] = token;

      const res = await fetch("/api/import", {
        method: "POST",
        headers,
        body: compressed,
      });
      const json = (await res.json()) as Result;
      setResult(res.ok ? json : { ok: false, error: (json as { error?: string }).error ?? "Import nie powiódł się." });
      if (res.ok) router.refresh();
    } catch (error) {
      setResult({ ok: false, error: error instanceof Error ? error.message : "Nie udało się połączyć z serwerem." });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="upload">
      <div
        className={`drop${drag ? " drag" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files?.[0];
          if (f) void send(f);
        }}
      >
        <p><strong>Wgraj plik LUDOS-on.lua</strong></p>
        <p className="muted">Przeciągnij tutaj albo wybierz z dysku. Plik jest automatycznie kompresowany przed wysłaniem. Ten sam plik możesz wgrać wiele razy, dane się nie zdublują.</p>
        <input
          ref={input}
          type="file"
          accept=".lua"
          disabled={busy}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void send(f); }}
        />
        {tokenRequired && (
          <label className="token">
            Token wgrywania
            <input type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" />
          </label>
        )}
      </div>

      <div aria-live="polite">
        {busy && <p className="muted">Importuję…</p>}
        {result?.ok === false && <p className="err">{result.error}</p>}
        {result?.ok === true && (
          <p className="ok">
            {result.duplicate
              ? "Ten plik był już zaimportowany. Nic się nie zmieniło."
              : `Zaimportowano ${result.characters} postaci (${result.names.join(", ")}): ${result.eventsNew} nowych zdarzeń z ${result.eventsTotal}.`}
          </p>
        )}
      </div>
    </div>
  );
}
