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
  const [progress, setProgress] = useState("");

  async function send(file: File) {
    setBusy(true);
    setResult(null);
    setProgress("Kompresuję plik…");
    const uploadId = crypto.randomUUID();
    const authHeaders: Record<string, string> = {};
    if (token) authHeaders["X-Upload-Token"] = token;
    try {
      if (typeof CompressionStream === "undefined") {
        throw new Error("Ta przeglądarka nie obsługuje kompresji plików. Otwórz stronę w aktualnej wersji Chrome, Edge lub Firefox.");
      }
      const compressed = await new Response(file.stream().pipeThrough(new CompressionStream("gzip"))).blob();
      if (compressed.size > 100 * 1024 * 1024) {
        throw new Error("Skompresowany plik przekracza limit 100 MB.");
      }

      const chunkSize = 512 * 1024;
      const total = Math.ceil(compressed.size / chunkSize);
      if (!total || total > 250) throw new Error("Plik jest zbyt duży — limit to 100 MB po kompresji.");
      for (let index = 0; index < total; index++) {
        const chunk = compressed.slice(index * chunkSize, Math.min((index + 1) * chunkSize, compressed.size));
        setProgress(`Wysyłanie porcji ${index + 1} z ${total}…`);
        const res = await fetch("/api/import/chunk", {
          method: "POST",
          headers: {
            ...authHeaders,
            "Content-Type": "application/octet-stream",
            "X-Ludos-Action": "chunk",
            "X-Ludos-Upload-Id": uploadId,
            "X-Ludos-Chunk-Index": String(index),
            "X-Ludos-Total-Chunks": String(total),
            "X-Ludos-Filename": encodeURIComponent(file.name),
          },
          body: chunk,
        });
        const json = await res.json() as { ok?: boolean; error?: string };
        if (!res.ok) throw new Error(json.error ?? `Nie udało się wysłać porcji ${index + 1}.`);
      }

      setProgress("Przetwarzam dane na serwerze…");
      const res = await fetch("/api/import/chunk", {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/octet-stream", "X-Ludos-Action": "complete", "X-Ludos-Upload-Id": uploadId },
        body: new Blob([]),
      });
      const json = await res.json() as Result;
      setResult(res.ok ? json : { ok: false, error: (json as { error?: string }).error ?? "Import nie powiódł się." });
      if (res.ok) router.refresh();
    } catch (error) {
      // Spróbuj posprzątać porcje, jeśli upload został przerwany.
      void fetch("/api/import/chunk", { method: "POST", headers: { ...authHeaders, "Content-Type": "application/octet-stream", "X-Ludos-Action": "cancel", "X-Ludos-Upload-Id": uploadId }, body: new Blob([]) }).catch(() => undefined);
      setResult({ ok: false, error: error instanceof Error ? error.message : "Nie udało się połączyć z serwerem." });
    } finally {
      setBusy(false);
      setProgress("");
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
        <p className="muted">Przeciągnij tutaj albo wybierz z dysku. Plik jest kompresowany i wysyłany porcjami. Ten sam plik możesz wgrać wiele razy, dane się nie zdublują.</p>
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
        {busy && <p className="muted" aria-live="polite">{progress || "Importuję…"}</p>}
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
