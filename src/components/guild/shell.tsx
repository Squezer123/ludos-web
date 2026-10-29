"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { fmtAgo } from "../../lib/guild-format";
import { IconDashboard, IconPanel, IconSettings, IconSwords, IconSync, IconTrophy, IconUsers } from "./icons";
import { RangeControls } from "./range-controls";

const NAV = [
  { slug: "", label: "Przegląd", Icon: IconDashboard },
  { slug: "members", label: "Członkowie", Icon: IconUsers },
  { slug: "rankings", label: "Rankingi", Icon: IconTrophy },
  { slug: "settings", label: "Ustawienia", Icon: IconSettings },
] as const;

function SyncLabel({ iso }: { iso: string | null }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  if (!iso) return <>Brak zsynchronizowanych danych</>;
  return (
    <>
      Ostatnia synchronizacja: <span suppressHydrationWarning>{now === null ? "…" : fmtAgo(new Date(iso).getTime(), now)}</span>
    </>
  );
}

export function GuildShell({
  guild, syncedAt, children,
}: { guild: string; syncedAt: string | null; children: ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false); // desktop: sidebar zwinięty
  const [mobileOpen, setMobileOpen] = useState(false); // mobile: sidebar jako nakładka

  useEffect(() => setMobileOpen(false), [pathname]);

  const toggle = () => {
    if (window.matchMedia("(max-width: 799px)").matches) setMobileOpen((o) => !o);
    else setCollapsed((c) => !c);
  };

  return (
    <div className="gs-frame" data-collapsed={collapsed} data-mobile-open={mobileOpen}>
      <aside className="gs-aside" aria-label="Nawigacja">
        <div className="gs-aside-in">
          <div className="gs-brand">
            <span className="gs-logo"><IconSwords size={22} /></span>
            <span>
              <span className="gs-brand-name">GuildStats</span>
              <span className="gs-brand-tag">Za Hordę!</span>
            </span>
          </div>
          <nav className="gs-nav">
            {NAV.map(({ slug, label, Icon }) => {
              const href = slug ? `/${slug}` : "/";
              const active = slug ? pathname.startsWith(href) : pathname === "/";
              return (
                <Link key={slug} href={href} className="gs-nav-item" aria-current={active ? "page" : undefined}>
                  <Icon size={16} />
                  {label}
                </Link>
              );
            })}
          </nav>
          <Link href="/admin" className="gs-admin-link">
            <IconSettings size={14} />
            Panel admina
          </Link>
        </div>
      </aside>
      <button className="gs-scrim" aria-label="Zamknij menu" tabIndex={-1} onClick={() => setMobileOpen(false)} />

      <div className="gs-main">
        <header className="gs-top">
          <button className="gs-icon-btn" onClick={toggle} aria-label="Przełącz menu boczne">
            <IconPanel size={18} />
          </button>
          <div className="gs-top-title">
            <div className="gs-guild">&lt;{guild}&gt;</div>
            <div className="gs-sync"><IconSync size={12} /><span><SyncLabel iso={syncedAt} /></span></div>
          </div>
          <Suspense fallback={null}>
            <RangeControls />
          </Suspense>
        </header>
        <main className="gs-content">{children}</main>
      </div>
    </div>
  );
}
