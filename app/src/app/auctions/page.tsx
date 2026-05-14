"use client";

import { AuctionCard } from "@/components/auction-card";
import { useAuctions } from "@/lib/hooks";
import { toUiAuction } from "@/lib/auctions";
import { statusLabel } from "@/lib/shadowbid";
import { useState } from "react";

export default function AuctionsPage() {
  const { auctions, loading } = useAuctions();
  const [filter, setFilter] = useState<string>("All");

  const filtered = filter === "All"
    ? auctions
    : auctions.filter((a) => statusLabel(a.status) === filter.toLowerCase());

  return (
    <div>
      <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-3xl font-black">Auctions</h1>
          <p className="mt-2 text-fog/60">Browse sealed-bid markets by status and settlement asset.</p>
        </div>
        <div className="flex gap-2">
          {["All", "Live", "Finalizing", "Finalized"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md border px-3 py-2 text-sm ${
                filter === f
                  ? "border-brass text-white"
                  : "border-white/10 text-fog/70 hover:border-brass hover:text-white"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>
      {loading && <p className="text-fog/50">Loading auctions...</p>}
      {!loading && filtered.length === 0 && (
        <p className="rounded-lg border border-white/10 bg-panel/80 p-8 text-center text-fog/50">
          No auctions found.
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        {filtered.map((a) => <AuctionCard key={a.pubkey.toBase58()} auction={toUiAuction(a)} />)}
      </div>
    </div>
  );
}
