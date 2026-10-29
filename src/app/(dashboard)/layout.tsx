import type { Metadata } from "next";
import { Cormorant_SC, Inter } from "next/font/google";
import { GuildShell } from "../../components/guild/shell";
import { lastSync, resolveGuild } from "../../lib/guild";
import "./guild.css";

const serif = Cormorant_SC({
  subsets: ["latin", "latin-ext"], weight: ["500", "600", "700"], variable: "--font-cormorant", display: "swap",
});
const sans = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = { title: "GuildStats — przegląd gildii" };
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [guild, synced] = await Promise.all([resolveGuild(), lastSync()]);

  return (
    <div className={`${serif.variable} ${sans.variable}`}>
      <GuildShell guild={guild.name} syncedAt={synced?.toISOString() ?? null}>
        {children}
      </GuildShell>
    </div>
  );
}
