"use client";

import { useAuctions } from "@/lib/hooks";
import { useMemo } from "react";

export default function LeaderboardPage() {
  const { auctions, loading } = useAuctions();

  const rows = useMemo(() => {
    const winsByCreator = new Map<string, number>();
    for (const a of auctions) {
      const key = a.creator.toBase58();
      winsByCreator.set(key, (winsByCreator.get(key) ?? 0) + 1);
    }
    return [...winsByCreator.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([creator, wins]) => ({
        creator: creator.slice(0, 4) + "..." + creator.slice(-4),
        wins,
      }));
  }, [auctions]);

  return (
    <div className="max-w-4xl">
      <h1 className="text-3xl font-black">Leaderboard</h1>
      <p className="mt-2 text-fog/60">Top creators by auction count.</p>
      {loading && <p className="mt-4 text-fog/50">Loading...</p>}
      {!loading && rows.length === 0 && (
        <p className="mt-4 text-fog/50">No auctions yet.</p>
      )}
      <div className="mt-6 overflow-hidden rounded-lg border border-white/10 bg-panel/80">
        {rows.map((row, index) => (
          <div
            key={row.creator}
            className="grid grid-cols-[56px_1fr_120px] items-center border-b border-white/10 px-5 py-4 last:border-b-0"
          >
            <div className="font-black text-brass">#{index + 1}</div>
            <div className="font-mono">{row.creator}</div>
            <div className="text-fog/70">{row.wins} {row.wins === 1 ? "auction" : "auctions"}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
