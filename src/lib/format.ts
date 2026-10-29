const TZ = "Europe/Warsaw";

export const CLASS_INFO: Record<string, { label: string; color: string }> = {
  WARRIOR: { label: "Wojownik", color: "#C69B6D" },
  MAGE: { label: "Mag", color: "#3FC7EB" },
  PRIEST: { label: "Kapłan", color: "#E8E8E8" },
  ROGUE: { label: "Łotrzyk", color: "#FFF468" },
  HUNTER: { label: "Łowca", color: "#AAD372" },
  DRUID: { label: "Druid", color: "#FF7C0A" },
  PALADIN: { label: "Paladyn", color: "#F48CBA" },
  SHAMAN: { label: "Szaman", color: "#0070DD" },
  WARLOCK: { label: "Czarnoksiężnik", color: "#8788EE" },
};
export const classInfo = (c: string | null) => (c && CLASS_INFO[c]) || { label: c ?? "?", color: "#8a8a8a" };

export const fmtInt = (n: number) => n.toLocaleString("pl-PL");

export function fmtDuration(sec: number): string {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h} h ${String(m).padStart(2, "0")} min`;
  if (m > 0) return `${m} min`;
  return `${sec} s`;
}

export function fmtMoney(copper: number): string {
  const g = Math.floor(copper / 10000);
  const s = Math.floor((copper % 10000) / 100);
  const c = copper % 100;
  const parts: string[] = [];
  if (g) parts.push(`${fmtInt(g)} g`);
  if (s) parts.push(`${s} s`);
  if (c || parts.length === 0) parts.push(`${c} m`);
  return parts.join(" ");
}

export const fmtDateTime = (d: Date | null) =>
  d ? d.toLocaleString("pl-PL", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
export const fmtTime = (d: Date | number) =>
  new Date(d).toLocaleTimeString("pl-PL", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
export const fmtDay = (d: Date | number) =>
  new Date(d).toLocaleDateString("pl-PL", { timeZone: TZ, day: "numeric", month: "short" });

export const SOURCE_LABEL: Record<string, string> = { mob: "Potwory", quest: "Questy", inne: "Inne" };
export const QUALITY_LABEL = ["Szary", "Zwykły", "Niezwykły", "Rzadki", "Epicki", "Legendarny"];
