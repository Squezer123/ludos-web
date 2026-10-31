export default function HeatmapLoading() {
  return (
    <main className="hm-page hm-loading-page" aria-busy="true" aria-live="polite">
      <div className="hm-loading-hero">
        <div className="hm-loading-emblem" aria-hidden="true">
          <span className="hm-loading-ring" />
          <span className="hm-loading-core">✦</span>
        </div>
        <p className="hm-loading-eyebrow">LUDOS · AZEROTH</p>
        <h1>Odkrywamy aktywność świata</h1>
        <p className="hm-loading-message">Ładowanie danych heatmapy…</p>
        <div className="hm-loading-progress" aria-hidden="true"><span /></div>
        <span className="hm-loading-hint">Przygotowujemy strefy i statystyki graczy</span>
      </div>

      <div className="hm-loading-skeleton" aria-hidden="true">
        <div className="hm-loading-filters">
          {Array.from({ length: 5 }, (_, index) => <span key={index} />)}
        </div>
        <div className="hm-loading-continents">
          {Array.from({ length: 4 }, (_, index) => <span key={index} />)}
        </div>
        <div className="hm-loading-panel">
          <span className="hm-loading-title" />
          {Array.from({ length: 4 }, (_, index) => <span className="hm-loading-row" key={index} />)}
        </div>
      </div>
    </main>
  );
}
