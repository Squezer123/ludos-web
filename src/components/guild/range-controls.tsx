"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { PRESETS, addDays, isDay, todayWarsaw } from "../../lib/range";
import { IconCalendar } from "./icons";

export function RangeControls() {
  const sp = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const box = useRef<HTMLDivElement>(null);

  // Na profilu gracza dochodzi opcja "Całość" (bez zakresu = cały okres); na stronie sesji zakres nic nie zmienia.
  const onPlayer = /^\/members\/\d+/.test(pathname);
  const onSession = /^\/members\/\d+\/sessions\//.test(pathname);

  const custom = isDay(sp.get("from")) && isDay(sp.get("to"));
  const rangeParam = sp.get("range");
  const active = custom ? "custom" : PRESETS.find((p) => p === rangeParam) ?? (onPlayer ? "all" : "30d");

  const url = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams(sp.toString());
    for (const k of ["range", "from", "to"]) q.delete(k);
    for (const [k, v] of Object.entries(patch)) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `${pathname}?${s}` : pathname;
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const toggle = () => {
    if (!open) {
      const today = todayWarsaw();
      setFrom(custom ? sp.get("from")! : addDays(today, -29));
      setTo(custom ? sp.get("to")! : today);
    }
    setOpen((o) => !o);
  };

  const valid = isDay(from) && isDay(to) && from <= to;
  const apply = () => {
    if (!valid) return;
    setOpen(false);
    router.push(url({ from, to }), { scroll: false });
  };

  if (onSession) return null;

  return (
    <div className="gs-range" ref={box}>
      {onPlayer && (
        <Link href={url({})} scroll={false} replace className="gs-chip" aria-current={active === "all" ? "true" : undefined}>
          Całość
        </Link>
      )}
      {PRESETS.map((p) => (
        <Link
          key={p} href={url({ range: p })} scroll={false} replace
          className="gs-chip" aria-current={active === p ? "true" : undefined}
        >
          {p}
        </Link>
      ))}
      <button
        type="button" className="gs-chip gs-chip-wide" aria-expanded={open} aria-haspopup="dialog"
        aria-current={active === "custom" ? "true" : undefined} onClick={toggle}
      >
        <IconCalendar size={15} />
        Własny
      </button>

      {open && (
        <div className="gs-pop" role="dialog" aria-label="Własny zakres dat">
          <label>Od<input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} /></label>
          <label>Do<input type="date" value={to} min={from || undefined} max={todayWarsaw()} onChange={(e) => setTo(e.target.value)} /></label>
          <button type="button" className="gs-apply" disabled={!valid} onClick={apply}>Zastosuj</button>
        </div>
      )}
    </div>
  );
}