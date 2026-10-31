import Link from "next/link";
import { getHeatmapData } from "../../../lib/heatmap";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function value(params: Record<string, string | string[] | undefined>, key: string, fallback: string) {
  const v = params[key];
  return typeof v === "string" ? v : fallback;
}
function dateInWarsaw(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d);
  const part = (name: string) => parts.find((p) => p.type === name)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
function numInRange(v: string, fallback: number, min: number, max: number) {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}
function validDate(v: string, fallback: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) ? v : fallback;
}

export default async function HeatmapPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const from = validDate(value(params, "from", dateInWarsaw(-6)), dateInWarsaw(-6));
  const toCandidate = validDate(value(params, "to", dateInWarsaw()), dateInWarsaw());
  const to = toCandidate < from ? from : toCandidate;
  const hourFrom = numInRange(value(params, "hourFrom", "0"), 0, 0, 23);
  const hourTo = numInRange(value(params, "hourTo", "23"), 23, 0, 23);
  const continentCandidate = value(params, "continent", "Eastern Kingdoms");
  const continent = ["Eastern Kingdoms", "Kalimdor", "Other", "All"].includes(continentCandidate) ? continentCandidate : "Eastern Kingdoms";
  const characterIdRaw = value(params, "characterId", "all");
  const characterId = characterIdRaw === "all" ? null : numInRange(characterIdRaw, -1, 1, 2147483647);
  const { zones, characters } = await getHeatmapData({ from, to, hourFrom, hourTo, characterId });
  const selected = zones.filter((z) => continent === "All" || z.continent === continent);
  const maxActivity = Math.max(1, ...selected.map((z) => z.activity));
  const totalActivity = selected.reduce((sum, z) => sum + z.activity, 0);
  const totalDeaths = selected.reduce((sum, z) => sum + z.deaths, 0);
  const continentOptions = ["Eastern Kingdoms", "Kalimdor", "Other", "All"];

  return (
    <div className="hm-page">
      <div className="hm-heading">
        <div>
          <Link href="/admin" className="hm-back">← Panel admina</Link>
          <h1>Heatmapa Azeroth</h1>
          <p>Przegląd aktywności zapisanej przez LUDOS-on według stref i czasu.</p>
        </div>
        <span className="hm-badge">Wersja 1 · dane historyczne</span>
      </div>

      <form className="hm-filters" method="get">
        <label>Od dnia<input type="date" name="from" required defaultValue={from} /></label>
        <label>Do dnia<input type="date" name="to" required defaultValue={to} /></label>
        <label>Godzina od<select name="hourFrom" defaultValue={String(hourFrom)}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}</select></label>
        <label>Godzina do<select name="hourTo" defaultValue={String(hourTo)}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:59</option>)}</select></label>
        <label>Postać<select name="characterId" defaultValue={characterId === null ? "all" : String(characterId)}><option value="all">Wszyscy gracze</option>{characters.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.realm}</option>)}</select></label>
        <input type="hidden" name="continent" value={continent} />
        <button type="submit">Zastosuj filtry</button>
      </form>

      <div className="hm-note">
        <strong>Jak czytać te dane?</strong>
        <span>Intensywność oznacza liczbę zarejestrowanych zdarzeń aktywności, a nie ciągły pomiar pozycji graczy. W obecnych plikach współrzędne są zapisywane tylko przy części zdarzeń śmierci, więc ten widok pokazuje aktywność według stref, a nie dokładną mapę cieplną wszystkich pozycji.</span>
      </div>

      <section className="hm-continent-grid" aria-label="Wybierz kontynent">
        {continentOptions.map((option) => {
          const active = continent === option;
          const count = zones.filter((z) => option === "All" || z.continent === option).length;
          return (
            <a key={option} href={`?${new URLSearchParams({ from, to, hourFrom: String(hourFrom), hourTo: String(hourTo), characterId: characterIdRaw, continent: option }).toString()}`}
              className={`hm-continent ${active ? "is-active" : ""}`}>
              <span className={`hm-silhouette hm-${option.toLowerCase().replaceAll(" ", "-")}`} aria-hidden="true">
                <i /><i /><i /><i />
              </span>
              <span className="hm-continent-copy"><strong>{option === "All" ? "Cały Azeroth" : option === "Other" ? "Inne / nieznane" : option}</strong><small>{count} stref z aktywnością</small></span>
              <span className="hm-arrow">↗</span>
            </a>
          );
        })}
      </section>

      <div className="hm-stats">
        <div><small>Zarejestrowane zdarzenia</small><strong>{totalActivity.toLocaleString("pl-PL")}</strong></div>
        <div><small>Śmierci</small><strong>{totalDeaths.toLocaleString("pl-PL")}</strong></div>
        <div><small>Strefy z aktywnością</small><strong>{selected.length.toLocaleString("pl-PL")}</strong></div>
      </div>

      <section className="hm-panel">
        <div className="hm-panel-heading">
          <div><h2>Najaktywniejsze strefy</h2><p>Wyniki dla wybranego kontynentu i zakresu czasu.</p></div>
          <span className="hm-range">{from} — {to} · {String(hourFrom).padStart(2, "0")}:00–{String(hourTo).padStart(2, "0")}:59</span>
        </div>
        {selected.length === 0 ? (
          <div className="hm-empty"><strong>Brak danych w wybranym zakresie</strong><span>Zmień datę, godziny albo wybierz inny kontynent.</span></div>
        ) : (
          <div className="hm-zone-list">
            {selected.slice(0, 30).map((zone, index) => (
              <div className="hm-zone" key={zone.zone}>
                <span className="hm-rank">{String(index + 1).padStart(2, "0")}</span>
                <div className="hm-zone-main">
                  <div className="hm-zone-title"><strong>{zone.zone}</strong><span>{zone.continent}</span></div>
                  <div className="hm-track"><span style={{ width: `${Math.max(2, (zone.activity / maxActivity) * 100)}%` }} /></div>
                </div>
                <div className="hm-zone-value"><strong>{zone.activity.toLocaleString("pl-PL")}</strong><small>zdarzeń</small></div>
                <div className="hm-zone-deaths"><strong>{zone.deaths.toLocaleString("pl-PL")}</strong><small>śmierci</small></div>
                <div className="hm-zone-players"><strong>{zone.players.toLocaleString("pl-PL")}</strong><small>graczy</small></div>
                <div className="hm-zone-last"><small>Ostatnia aktywność</small><span>{zone.lastSeen}</span></div>
              </div>
            ))}
          </div>
        )}
      </section>
      <p className="hm-footnote">Wyniki obejmują do 30 najaktywniejszych stref. Czas wyświetlany jest według strefy Europe/Warsaw.</p>
    </div>
  );
}
