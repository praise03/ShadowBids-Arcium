"use client";

import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { BarChart3, Gavel, LayoutDashboard, Trophy, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const nav = [
  { href: "/", label: "Desk", icon: LayoutDashboard },
  { href: "/auctions", label: "Auctions", icon: Gavel },
  { href: "/create", label: "Create", icon: BarChart3 },
  { href: "/portfolio", label: "Portfolio", icon: UserRound },
  { href: "/leaderboard", label: "Leaders", icon: Trophy },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-ink/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-md bg-brass text-sm font-black text-ink">SB</div>
            <div>
              <div className="text-sm font-black uppercase tracking-[0.22em] text-brass">ShadowBid</div>
              <div className="text-xs text-fog/60">Sealed auctions with private compute</div>
            </div>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {nav.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    "flex items-center gap-2 rounded-md px-3 py-2 text-sm text-fog/70 transition hover:bg-white/10 hover:text-white",
                    pathname === item.href && "bg-white/10 text-white",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <WalletMultiButton />
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
