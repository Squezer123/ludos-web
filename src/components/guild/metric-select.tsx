"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { IconChevronDown } from "./icons";

export function MetricSelect({ value, options }: { value: string; options: { value: string; label: string }[] }) {
  const sp = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  return (
    <label className="gs-select">
      <span className="gs-sr">Wskaźnik wykresu</span>
      <select
        value={value}
        onChange={(e) => {
          const q = new URLSearchParams(sp.toString());
          q.set("metric", e.target.value);
          router.replace(`${pathname}?${q}`, { scroll: false });
        }}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <IconChevronDown size={16} />
    </label>
  );
}
