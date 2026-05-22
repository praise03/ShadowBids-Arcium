"use client";

import { StatusBadge } from "@/components/status-badge";
import {
  useAuction,
  useCloseBidding,
  useMarkSettlementCompleted,
  useSubmitBid,
  useTriggerConfidentialCompute,
} from "@/lib/hooks";
import { toUiAuctionDetail, shortPubkey } from "@/lib/auctions";
import { CheckCircle2, Clock3, LockKeyhole, RadioTower, Send } from "lucide-react";
import { PublicKey } from "@solana/web3.js";
import { useParams } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { useState } from "react";

export default function AuctionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const wallet = useWallet();
  const auctionPk = id ? new PublicKey(id) : null;
  const { auction, result, loading, refresh } = useAuction(auctionPk);
  const { submit, pending: submitting } = useSubmitBid();
  const { close, pending: closing } = useCloseBidding();
  const { trigger, pending: triggering } = useTriggerConfidentialCompute();
  const { markSettled, pending: settling } = useMarkSettlementCompleted();
  const [bidAmount, setBidAmount] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (loading) return <p className="text-fog/50">Loading auction...</p>;
  if (!auction) return <p className="text-signal">Auction not found.</p>;

  const ui = toUiAuctionDetail(auction, result);
  const isActive = ui.status === "live" || ui.status === "upcoming";

  const handleBid = async () => {
    if (!auctionPk || !bidAmount || !wallet.connected) return;
    try {
      setError(null);
      const tx = await submit({ auction: auctionPk, amount: parseInt(bidAmount, 10) });
      setBidAmount("");
      setFeedback(`Encrypted bid submitted: ${tx}`);
      await refresh();
    } catch (e) {
      console.error("Bid failed", e);
      setError(e instanceof Error ? e.message : "Bid submission failed.");
    }
  };

  const handleClose = async () => {
    if (!auctionPk) return;
    try {
      setError(null);
      const tx = await close(auctionPk);
      setFeedback(`Bidding closed: ${tx}`);
      await refresh();
    } catch (e) {
      console.error("Close failed", e);
      setError(e instanceof Error ? e.message : "Close bidding failed.");
    }
  };

  const handleTrigger = async () => {
    if (!auctionPk) return;
    try {
      setError(null);
      const tx = await trigger(auctionPk);
      setFeedback(`Confidential compute queued: ${tx}`);
      await refresh();
    } catch (e) {
      console.error("Trigger failed", e);
      setError(e instanceof Error ? e.message : "Failed to queue confidential compute.");
    }
  };

  const handleSettlement = async () => {
    if (!auctionPk) return;
    try {
      setError(null);
      const tx = await markSettled(auctionPk);
      setFeedback(`Settlement marked complete: ${tx}`);
      await refresh();
    } catch (e) {
      console.error("Settlement failed", e);
      setError(e instanceof Error ? e.message : "Failed to mark settlement complete.");
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <section className="rounded-lg border border-white/10 bg-panel/80 p-6 shadow-glow">
        <div className="flex items-start justify-between gap-4">
          <div>
            <StatusBadge status={ui.status} />
            <h1 className="mt-4 text-4xl font-black">{ui.title}</h1>
            <p className="mt-3 max-w-3xl leading-7 text-fog/65">{ui.description}</p>
          </div>
          <div className="rounded-md bg-white/8 px-4 py-3 text-right">
            <div className="text-xs text-fog/50">Reserve</div>
            <div className="text-2xl font-black">{ui.reservePrice} {ui.assetSymbol}</div>
          </div>
        </div>
        <div className="mt-8 grid gap-3 md:grid-cols-4">
          <Fact label="Bids" value={String(ui.bidCount)} />
          <Fact label="Increment" value={`${ui.minBidIncrement} ${ui.assetSymbol}`} />
          <Fact label="Creator" value={shortPubkey(auction.creator)} />
          <Fact label="Ends" value={new Date(ui.endTime).toLocaleString()} />
        </div>
        <div className="mt-8">
          <h2 className="text-xl font-black">Lifecycle</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            {([
              ["Bid", "Encrypted amount submitted", Send],
              ["Close", "Time window locks", Clock3],
              ["Compute", "Arcium selects winner", RadioTower],
              ["Reveal", "Winner receipt on-chain", CheckCircle2],
            ] as const).map(([t, c, Icon]) => (
              <div key={t} className="rounded-md border border-white/10 bg-white/[0.035] p-4">
                <Icon className="h-5 w-5 text-brass" />
                <div className="mt-3 font-bold">{t}</div>
                <div className="mt-1 text-sm text-fog/55">{c}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
      <aside className="space-y-4">
        <div className="rounded-lg border border-mint/20 bg-mint/10 p-5">
          <div className="flex items-center gap-2 font-black"><LockKeyhole className="h-5 w-5" /> Submit sealed bid</div>
          {!wallet.connected ? (
            <p className="mt-4 text-sm text-fog/60">Connect a wallet to place a bid.</p>
          ) : !isActive ? (
            <p className="mt-4 text-sm text-fog/60">This auction is not accepting bids.</p>
          ) : (
            <>
              <label className="mt-5 block text-sm text-fog/60">Bid amount</label>
              <input
                className="mt-2 w-full rounded-md border border-white/10 bg-ink px-3 py-3 text-white outline-none focus:border-mint"
                placeholder={`Amount in ${ui.assetSymbol}`}
                value={bidAmount}
                onChange={(e) => setBidAmount(e.target.value)}
                type="number"
              />
              <button
                onClick={handleBid}
                disabled={submitting || !bidAmount}
                className="mt-4 w-full rounded-md bg-brass px-4 py-3 font-black text-ink disabled:opacity-40"
              >
                {submitting ? "Submitting..." : "Encrypt and submit"}
              </button>
              <p className="mt-3 text-xs leading-5 text-fog/55">
                The UI stores only encrypted ciphertexts on-chain. Plaintext bid values remain client-side before private compute.
              </p>
            </>
          )}
          {feedback && <p className="mt-3 break-all text-xs text-mint">{feedback}</p>}
          {error && <p className="mt-3 text-xs text-signal">{error}</p>}
        </div>
        <div className="rounded-lg border border-white/10 bg-panel/80 p-5">
          <h2 className="font-black">Auction actions</h2>
          <div className="mt-4 grid gap-3">
            <button
              onClick={handleClose}
              disabled={!wallet.connected || closing || !(ui.status === "live" || ui.status === "upcoming")}
              className="rounded-md border border-white/10 px-4 py-3 font-bold text-fog disabled:opacity-40"
            >
              {closing ? "Closing..." : "Close bidding"}
            </button>
            <button
              onClick={handleTrigger}
              disabled={!wallet.connected || triggering || ui.status !== "closed"}
              className="rounded-md border border-brass/30 bg-brass/10 px-4 py-3 font-bold text-brass disabled:opacity-40"
            >
              {triggering ? "Queueing..." : "Trigger confidential compute"}
            </button>
            <button
              onClick={handleSettlement}
              disabled={!wallet.connected || settling || ui.status !== "finalized"}
              className="rounded-md border border-mint/20 bg-mint/10 px-4 py-3 font-bold text-mint disabled:opacity-40"
            >
              {settling ? "Marking..." : "Mark settlement complete"}
            </button>
            <p className="text-xs leading-5 text-fog/55">
              ShadowBid’s Arcium circuit has a fixed width of 8 bids. When fewer bids exist, the client pads the queue with duplicate sealed bid accounts so the real confidential compute flow can still finalize.
            </p>
          </div>
        </div>
        <div className="rounded-lg border border-white/10 bg-panel/80 p-5">
          <h2 className="font-black">Result</h2>
          {result ? (
            <div className="mt-4 space-y-3 text-sm">
              <Fact label="Winner" value={shortPubkey(result.winner)} />
              <Fact label="Winning bid" value={`${result.winningAmount.toNumber()} ${ui.assetSymbol}`} />
            </div>
          ) : (
            <p className="mt-3 text-sm leading-6 text-fog/60">Winner is hidden until finalization completes.</p>
          )}
        </div>
      </aside>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-white/10 bg-ink/55 p-3">
      <div className="text-xs text-fog/45">{label}</div>
      <div className="truncate text-sm font-bold text-white">{value}</div>
    </div>
  );
}
