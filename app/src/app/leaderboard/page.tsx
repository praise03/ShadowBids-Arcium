"use client";

import { useLeaderboard } from "@/lib/hooks";

export default function LeaderboardPage() {
  const { rows, loading } = useLeaderboard();

  return (
    <div className="max-w-4xl">
      <h1 className="text-3xl font-black">Leaderboard</h1>
      <p className="mt-2 text-fog/60">Live wallet rankings from on-chain `userStats` accounts.</p>
      {loading && <p className="mt-4 text-fog/50">Loading...</p>}
      {!loading && rows.length === 0 && (
        <p className="mt-4 text-fog/50">No auctions yet.</p>
      )}
      <div className="mt-6 overflow-hidden rounded-lg border border-white/10 bg-panel/80">
        {rows.map((row, index) => (
          <div
            key={row.owner.toBase58()}
            className="grid grid-cols-[56px_1.5fr_100px_120px_100px] items-center border-b border-white/10 px-5 py-4 last:border-b-0"
          >
            <div className="font-black text-brass">#{index + 1}</div>
            <div className="font-mono">{row.owner.toBase58().slice(0, 4)}...{row.owner.toBase58().slice(-4)}</div>
            <div className="text-fog/70">{row.wins} wins</div>
            <div className="text-fog/70">{row.auctionsCreated} created</div>
            <div className="text-fog/70">{row.bidsPlaced} bids</div>
          </div>
        ))}
      </div>
    </div>
  );
}
