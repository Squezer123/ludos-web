"use client";

import { useEffect, useState } from "react";

type Props = { itemId: unknown; name: string; quality: number };

/** Ikona przedmiotu pobierana po ID z endpointu Wowhead; w razie braku danych pokazujemy fallback. */
export function ItemIcon({ itemId, name, quality }: Props) {
  const id = typeof itemId === "number" || (typeof itemId === "string" && /^\d+$/.test(itemId))
    ? String(itemId)
    : "";
  const [icon, setIcon] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let active = true;
    fetch(`/api/item-icon/${id}`)
      .then((response) => response.ok ? response.json() : null)
      .then((data: { icon?: string } | null) => {
        if (active && data?.icon && /^[a-z0-9_]+$/i.test(data.icon)) setIcon(data.icon);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [id]);

  return (
    <span className={`gs-item-icon gs-quality-${quality}`} title={name} aria-label={`Ikona przedmiotu: ${name}`}>
      {icon ? <img src={`https://wow.zamimg.com/images/wow/icons/medium/${icon}.jpg`} alt="" loading="lazy" /> : <span aria-hidden="true">✦</span>}
    </span>
  );
}
