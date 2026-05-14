"use client";

import { useUserStats, useAuctions } from "@/lib/hooks";
import { useWallet } from "@solana/wallet-adapter-react";

export default function PortfolioPage() {
  const wallet = useWallet();
  const { stats, loading: statsLoading } = useUserStats();
  const { auctions, loading: auctionsLoading } = useAuctions();

  const myAuctions = auctions.filter((a) => wallet.publicKey && a.creator.equals(wallet.publicKey));

  if (!wallet.connected) {
    return (
      <div>
        <h1 className="text-3xl font-black">Portfolio</h1>
        <p className="mt-4 text-fog/60">Connect your wallet to view your stats.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-black">Portfolio</h1>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Stat label="Auctions created" value={statsLoading ? "..." : String(stats?.auctionsCreated ?? 0)} />
        <Stat label="Bids placed" value={statsLoading ? "..." : String(stats?.bidsPlaced ?? 0)} />
        <Stat label="Wins" value={statsLoading ? "..." : String(stats?.wins ?? 0)} />
      </div>
      <div className="mt-8 rounded-lg border border-white/10 bg-panel/80">
        {auctionsLoading && <p className="p-5 text-fog/50">Loading...</p>}
        {!auctionsLoading && myAuctions.length === 0 && (
          <p className="p-5 text-fog/50">No auctions created yet.</p>
        )}
        {myAuctions.map((a) => (
          <div key={a.pubkey.toBase58()} className="flex items-center justify-between border-b border-white/10 px-5 py-4 last:border-b-0">
            <div>
              <div className="font-bold">{a.title}</div>
              <div className="text-sm text-fog/50">{a.bidCount} private bids</div>
            </div>
            <div className="font-mono text-sm text-brass">{a.assetSymbol}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-panel/80 p-5">
      <div className="text-sm text-fog/55">{label}</div>
      <div className="mt-2 text-3xl font-black">{value}</div>
    </div>
  );
}
