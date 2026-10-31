import Link from "next/link";
import { listCharacters } from "../../../lib/queries";
import { classInfo, fmtDateTime, fmtDuration, fmtInt } from "../../../lib/format";
import { PrintReportButton } from "../../../components/print-report-button";

export const dynamic = "force-dynamic";

export default async function AdminReportPage() {
  const chars = await listCharacters();
  const totals = chars.reduce(
    (a, c) => ({
      exp: a.exp + c.exp,
      deaths: a.deaths + c.deaths,
      kills: a.kills + c.kills,
      sessions: a.sessions + c.sessions,
      playtime: a.playtime + (c.playedSeconds ?? 0),
    }),
    { exp: 0, deaths: 0, kills: 0, sessions: 0, playtime: 0 },
  );

  return (
    <div className="admin-report">
      <div className="report-actions no-print">
        <Link href="/admin">← Wróć do panelu</Link>
        <PrintReportButton />
      </div>
      <header className="report-header">
        <p className="report-kicker">LUDOS WEB · RAPORT ADMINISTRACYJNY</p>
        <h1>Raport danych gildii</h1>
        <p>Wygenerowano: {new Intl.DateTimeFormat("pl-PL", { dateStyle: "long", timeStyle: "short" }).format(new Date())}</p>
      </header>

      <section className="report-stats">
        <div><span>Postacie</span><strong>{fmtInt(chars.length)}</strong></div>
        <div><span>Łączne doświadczenie</span><strong>{fmtInt(totals.exp)} XP</strong></div>
        <div><span>Pokonane potwory</span><strong>{fmtInt(totals.kills)}</strong></div>
        <div><span>Śmierci</span><strong>{fmtInt(totals.deaths)}</strong></div>
        <div><span>Sesje</span><strong>{fmtInt(totals.sessions)}</strong></div>
        <div><span>Łączny czas gry</span><strong>{fmtDuration(totals.playtime)}</strong></div>
      </section>

      <h2>Zestawienie postaci</h2>
      {chars.length === 0 ? <p>Brak danych do raportu.</p> : (
        <table className="report-table">
          <thead><tr><th>Postać</th><th>Klasa</th><th>Realm</th><th>Poziom</th><th>XP</th><th>Potwory</th><th>Śmierci</th><th>Sesje</th><th>Czas gry</th><th>Ostatnio widziana</th></tr></thead>
          <tbody>
            {chars.map((c) => {
              const ci = classInfo(c.class);
              return <tr key={c.id}>
                <td>{c.name}</td><td>{ci.label}</td><td>{c.realm}</td>
                <td>{c.level ?? "—"}</td><td>{fmtInt(c.exp)}</td><td>{fmtInt(c.kills)}</td>
                <td>{fmtInt(c.deaths)}</td><td>{c.sessions}</td>
                <td>{c.playedSeconds ? fmtDuration(c.playedSeconds) : "—"}</td><td>{fmtDateTime(c.lastSeen)}</td>
              </tr>;
            })}
          </tbody>
        </table>
      )}
      <footer className="report-footer">Raport wygenerowany z aktualnych danych zapisanych w Ludos Web.</footer>
      <style>{`
        .admin-report { color: #211d18; background: #fff; padding: 24px; border-radius: 12px; }
        .report-actions { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:24px; }
        .report-actions a { color:#72531b; text-decoration:none; }
        .print-report-button { border:0; border-radius:8px; padding:11px 16px; color:#fff; background:#72531b; font-weight:700; cursor:pointer; }
        .report-header { border-bottom:2px solid #b68b3c; padding-bottom:16px; margin-bottom:20px; }
        .report-kicker { font-size:11px; letter-spacing:2px; font-weight:700; color:#72531b; }
        .report-header h1 { margin:8px 0; font-size:30px; }
        .report-header p:last-child { color:#625c54; font-size:12px; }
        .report-stats { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; margin:20px 0 28px; }
        .report-stats div { border:1px solid #ded8ce; border-radius:8px; padding:12px; }
        .report-stats span { display:block; color:#625c54; font-size:12px; margin-bottom:6px; }
        .report-stats strong { font-size:20px; }
        .admin-report h2 { font-size:20px; margin:20px 0 12px; }
        .report-table { width:100%; border-collapse:collapse; font-size:11px; }
        .report-table th,.report-table td { border:1px solid #d8d3ca; padding:7px 6px; text-align:left; }
        .report-table th { background:#f1ede6; }
        .report-table tr { break-inside:avoid; }
        .report-footer { margin-top:24px; border-top:1px solid #ded8ce; padding-top:10px; font-size:10px; color:#625c54; }
        @media (max-width:700px) { .admin-report { padding:12px; overflow-x:auto; } .report-stats { grid-template-columns:repeat(2,minmax(0,1fr)); } }
        @media print {
          @page { size: landscape; margin: 12mm; }
          body { background:#fff !important; color:#000 !important; }
          body * { visibility:hidden; }
          .admin-report,.admin-report * { visibility:visible; }
          .admin-report { position:absolute; left:0; top:0; width:100%; padding:0; margin:0; border-radius:0; }
          .no-print, header.top, main.wrap > :not(.admin-report) { display:none !important; }
          .report-table { font-size:9px; }
          .report-table th,.report-table td { padding:4px; }
          .report-stats div { break-inside:avoid; }
          * { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
        }
      `}</style>
    </div>
  );
}
