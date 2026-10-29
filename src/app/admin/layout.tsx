import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { hasAdminSession } from "../../lib/admin-auth";

export const metadata: Metadata = { title: "Panel admina — GuildStats" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!(await hasAdminSession())) redirect("/login");
  return (
    <>
      <header className="top">
        <div className="wrap">
          <Link href="/admin" className="brand">Panel admina<span>wgrywanie danych</span></Link>
          <div style={{ margin: "0 0 0 auto", display: "flex", gap: 16, alignItems: "center" }}><Link href="/" className="back">← Przegląd gildii</Link><form action="/api/admin/logout" method="post"><button type="submit">Wyloguj</button></form></div>
        </div>
      </header>
      <main className="wrap">{children}</main>
    </>
  );
}
