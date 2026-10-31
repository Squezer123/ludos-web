"use client";

export function PrintReportButton() {
  return (
    <button type="button" onClick={() => window.print()} className="print-report-button">
      Generuj / zapisz jako PDF
    </button>
  );
}
