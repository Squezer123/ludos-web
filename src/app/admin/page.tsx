import Link from "next/link";
import { UploadForm } from "../../components/upload-form";
import { ResetDataButton } from "../../components/reset-data-button";
import { classInfo, fmtDateTime, fmtDuration, fmtInt } from "../../lib/format";
import { listCharacters } from "../../lib/queries";

export const dynamic = "force-dynamic";

export default async function Home() {
  const chars = await listCharacters();
  const totals = chars.reduce(
    (a, c) => ({ exp: a.exp + c.exp, deaths: a.deaths + c.deaths, kills: a.kills + c.kills }),
    { exp: 0, deaths: 0, kills: 0 },
  );

  return (
    <>
      <h1>Panel admina</h1>
      <p className="sub">Wgrywanie danych z addona LUDOS-on i podgląd postaci. Dostęp ograniczony do zalogowanego administratora.</p>

      <section className="panel">
        <UploadForm tokenRequired={Boolean(process.env.UPLOAD_TOKEN)} />
      </section>

      <section className="panel" style={{ marginTop: 16, borderColor: "rgba(180, 35, 24, 0.45)" }}>
        <h2>Strefa niebezpieczna</h2>
        <p className="muted">Usuwa wszystkie postacie, sesje, statystyki, zdarzenia oraz historię importów z bazy danych. Operacja jest nieodwracalna.</p>
        <ResetDataButton />
      </section>

      {chars.length === 0 ? (
        <p className="empty">Nie ma jeszcze żadnych postaci. Wgraj plik LUDOS-on.lua z folderu SavedVariables.</p>
      ) : (
        <>
          <div className="tiles">
            <div className="tile"><b>{chars.length}</b><span>postaci</span></div>
            <div className="tile"><b>{fmtInt(totals.exp)}</b><span>exp razem</span></div>
            <div className="tile"><b>{fmtInt(totals.kills)}</b><span>ubitych potworów</span></div>
            <div className="tile"><b>{fmtInt(totals.deaths)}</b><span>śmierci</span></div>
          </div>

          <section className="panel scroll" style={{ marginTop: 16 }}>
            <table>
              <thead>
                <tr>
                  <th>Postać</th>
                  <th className="r">Poz.</th>
                  <th className="r">Czas gry</th>
                  <th className="r">Exp</th>
                  <th className="r">Potwory</th>
                  <th className="r">Śmierci</th>
                  <th className="r">Sesje</th>
                  <th>Ostatnio</th>
                </tr>
              </thead>
              <tbody>
                {chars.map((c) => {
                  const ci = classInfo(c.class);
                  return (
                    <tr key={c.id}>
                      <td>
                        <Link href={`/admin/c/${c.id}`} className="who">
                          <span className="swatch" style={{ background: ci.color }} aria-hidden />
                          {c.name}
                        </Link>
                        <div className="muted" style={{ fontSize: 13 }}>{ci.label} · {c.realm}</div>
                      </td>
                      <td className="r">{c.level ?? "—"}</td>
                      <td className="r">{c.playedSeconds ? fmtDuration(c.playedSeconds) : "—"}</td>
                      <td className="r">{fmtInt(c.exp)}</td>
                      <td className="r">{fmtInt(c.kills)}</td>
                      <td className="r">{fmtInt(c.deaths)}</td>
                      <td className="r">{c.sessions}</td>
                      <td>{fmtDateTime(c.lastSeen)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        </>
      )}
    </>
  );
}
