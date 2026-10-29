import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { hasAdminSession, adminPasswordConfigured } from "../../lib/admin-auth";
import { LoginForm } from "../../components/login-form";

export const metadata: Metadata = { title: "Logowanie — Ludos" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await hasAdminSession()) redirect("/admin");
  const configured = adminPasswordConfigured();
  return (
    <main className="wrap" style={{ maxWidth: 520, paddingTop: 64 }}>
      <section className="panel" style={{ padding: 28 }}>
        <h1>Panel administracyjny</h1>
        <p className="sub">Dostęp tylko dla administratora.</p>
        {!configured ? (
          <p className="err">Panel jest zablokowany. Ustaw zmienną środowiskową ADMIN_PASSWORD (minimum 16 znaków), aby włączyć logowanie.</p>
        ) : <LoginForm />}
        <p style={{ marginTop: 20 }}><a href="/">← Wróć do przeglądu</a></p>
      </section>
    </main>
  );
}
