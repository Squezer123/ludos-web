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
      const body = new FormData();
      body.set("file", file);
      if (token) body.set("token", token);
      const res = await fetch("/api/import", { method: "POST", body });
      const json = (await res.json()) as Result;
      setResult(res.ok ? json : { ok: false, error: (json as { error?: string }).error ?? "Import nie powiódł się." });
      if (res.ok) router.refresh();
    } catch {
      setResult({ ok: false, error: "Nie udało się połączyć z serwerem." });
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
        <p className="muted">Przeciągnij tutaj albo wybierz z dysku. Ten sam plik możesz wgrać wiele razy, dane się nie zdublują.</p>
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
