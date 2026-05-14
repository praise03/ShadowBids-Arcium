"use client";

import { AuctionCard } from "@/components/auction-card";
import { useAuctions } from "@/lib/hooks";
import { toUiAuction } from "@/lib/auctions";
import { ShieldCheck, TimerReset, Workflow } from "lucide-react";

export default function Home() {
  const { auctions, loading } = useAuctions();

  return (
    <div className="space-y-8">
      <section className="grid gap-5 lg:grid-cols-[1.3fr_.7fr]">
        <div className="rounded-lg border border-white/10 bg-ink/70 p-6 shadow-glow">
          <div className="text-sm font-bold uppercase tracking-[0.18em] text-brass">Frontier build</div>
          <h1 className="mt-4 max-w-3xl text-5xl font-black leading-tight text-white">Private bids, public finality.</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-fog/70">
            ShadowBid keeps bid amounts confidential during the auction and reveals only the winning outcome after Arcium computation finalizes.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {([
              ["Sealed", "Bid ciphertexts only", ShieldCheck],
              ["Timed", "Strict lifecycle states", TimerReset],
              ["Verifiable", "On-chain result receipt", Workflow],
            ] as const).map(([title, copy, Icon]) => (
              <div key={title} className="rounded-md border border-white/10 bg-white/[0.04] p-4">
                <Icon className="h-5 w-5 text-mint" />
                <div className="mt-3 font-bold">{title}</div>
                <div className="text-sm text-fog/55">{copy}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-brass/20 bg-brass/10 p-6">
          <div className="text-sm font-bold uppercase tracking-[0.18em] text-brass">Live desk</div>
          <div className="mt-6 space-y-5">
            <Metric
              label="Open auctions"
              value={loading ? "..." : String(auctions.filter((a) => "live" in a.status || "upcoming" in a.status).length)}
            />
            <Metric
              label="Total bids"
              value={loading ? "..." : String(auctions.reduce((s, a) => s + a.bidCount, 0))}
            />
            <Metric
              label="Finalized"
              value={loading ? "..." : String(auctions.filter((a) => "finalized" in a.status).length)}
            />
          </div>
        </div>
      </section>
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-2xl font-black">Featured auctions</h2>
          {loading && <span className="text-sm text-fog/50">Loading...</span>}
        </div>
        {auctions.length === 0 && !loading && (
          <p className="rounded-lg border border-white/10 bg-panel/80 p-8 text-center text-fog/50">
            No auctions yet. Connect a wallet on devnet and create one.
          </p>
        )}
        <div className="grid gap-4 md:grid-cols-3">
          {auctions.map((a) => <AuctionCard key={a.pubkey.toBase58()} auction={toUiAuction(a)} />)}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-white/10 pb-4">
      <div className="text-sm text-fog/55">{label}</div>
      <div className="mt-1 text-3xl font-black text-white">{value}</div>
    </div>
  );
}
