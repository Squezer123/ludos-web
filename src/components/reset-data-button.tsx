"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ResetDataButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function resetData() {
    const first = window.confirm("Czy na pewno chcesz usunąć WSZYSTKIE dane z tej strony? Tej operacji nie można cofnąć.");
    if (!first) return;
    const confirmation = window.prompt('Aby potwierdzić, wpisz dokładnie: WYCZYŚĆ');
    if (confirmation !== "WYCZYŚĆ") {
      setMessage("Anulowano. Dane nie zostały usunięte.");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/reset", { method: "POST" });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) {
        setMessage(result.error ?? "Nie udało się wyzerować danych.");
        return;
      }
      setMessage("Wszystkie dane zostały usunięte.");
      router.refresh();
    } catch {
      setMessage("Błąd połączenia z serwerem. Sprawdź, czy dane zostały wyzerowane.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={resetData} disabled={busy}
        style={{ background: "#b42318", color: "#fff", border: 0, borderRadius: 6, padding: "9px 13px", cursor: busy ? "wait" : "pointer", opacity: busy ? 0.7 : 1 }}>
        {busy ? "Usuwanie danych…" : "Wyzeruj wszystkie dane"}
      </button>
      {message && <p role="status" className={message.includes("usunięte") ? "ok" : "err"}>{message}</p>}
    </div>
  );
}
