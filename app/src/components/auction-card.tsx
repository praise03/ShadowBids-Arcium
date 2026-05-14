import type { UiAuction } from "@/lib/auctions";
import { ArrowUpRight, Clock3, LockKeyhole } from "lucide-react";
import Link from "next/link";
import { StatusBadge } from "./status-badge";

export function AuctionCard({ auction }: { auction: UiAuction }) {
  return (
    <Link
      href={`/auctions/${auction.id}`}
      className="group block rounded-lg border border-white/10 bg-panel/82 p-5 shadow-glow transition hover:-translate-y-0.5 hover:border-brass/45"
    >
      <div className="flex items-start justify-between gap-4">
        <StatusBadge status={auction.status} />
        <ArrowUpRight className="h-4 w-4 text-fog/50 transition group-hover:text-brass" />
      </div>
      <h2 className="mt-5 text-xl font-black text-white">{auction.title}</h2>
      <p className="mt-2 min-h-12 text-sm leading-6 text-fog/65">{auction.description}</p>
      <div className="mt-5 grid grid-cols-3 gap-3 border-t border-white/10 pt-4 text-sm">
        <div>
          <div className="text-fog/45">Reserve</div>
          <div className="font-bold">{auction.reservePrice} {auction.assetSymbol}</div>
        </div>
        <div>
          <div className="text-fog/45">Bids</div>
          <div className="font-bold">{auction.bidCount}</div>
        </div>
        <div>
          <div className="text-fog/45">Privacy</div>
          <div className="flex items-center gap-1 font-bold"><LockKeyhole className="h-3 w-3" /> Arcium</div>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2 text-xs text-fog/50">
        <Clock3 className="h-3.5 w-3.5" />
        {new Date(auction.endTime).toLocaleString()}
      </div>
    </Link>
  );
}
