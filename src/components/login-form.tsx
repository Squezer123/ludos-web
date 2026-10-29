"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        setError("Nieprawidłowe hasło lub logowanie nie jest skonfigurowane.");
        return;
      }
      router.replace("/admin");
      router.refresh();
    } catch {
      setError("Nie udało się połączyć z serwerem.");
    } finally {
      setBusy(false);
    }
  }

  return <form onSubmit={submit}>
    <label className="token">Hasło administratora
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required minLength={1} />
    </label>
    {error && <p className="err" role="alert">{error}</p>}
    <button type="submit" disabled={busy} style={{ marginTop: 16 }}>{busy ? "Logowanie…" : "Zaloguj się"}</button>
  </form>;
}
