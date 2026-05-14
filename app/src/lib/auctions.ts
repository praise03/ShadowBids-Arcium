import { PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { statusLabel, findResultPda, PROGRAM_ID } from "./shadowbid";
import type { AuctionData, AuctionResultData } from "./shadowbid";

export type UiAuction = {
  pubkey: PublicKey;
  id: string;
  title: string;
  description: string;
  assetSymbol: string;
  reservePrice: number;
  minBidIncrement: number;
  endTime: string;
  status: "upcoming" | "live" | "closed" | "finalizing" | "finalized" | "reserve-not-met" | "failed" | "cancelled";
  bidCount: number;
  creator: string;
};

export type UiAuctionDetail = UiAuction & {
  startTime: number;
  revealDeadline: number;
  createdAt: number;
  winner?: string;
  winningAmount?: number;
};

const STATUS_MAP: Record<string, UiAuction["status"]> = {
  upcoming: "upcoming",
  live: "live",
  closed: "closed",
  finalizing: "finalizing",
  finalized: "finalized",
  "reserve-not-met": "reserve-not-met",
  failed: "failed",
  cancelled: "cancelled",
};

export function toUiAuction(a: AuctionData): UiAuction {
  const label = statusLabel(a.status);
  return {
    pubkey: a.pubkey,
    id: a.pubkey.toBase58(),
    title: a.title,
    description: a.description,
    assetSymbol: a.assetSymbol,
    reservePrice: a.reservePrice.toNumber(),
    minBidIncrement: a.minBidIncrement.toNumber(),
    endTime: new Date(Number(a.endTime) * 1000).toISOString(),
    status: STATUS_MAP[label] ?? "live",
    bidCount: a.bidCount,
    creator: a.creator.toBase58().slice(0, 8) + "...",
  };
}

export function toUiAuctionDetail(a: AuctionData, r: AuctionResultData | null): UiAuctionDetail {
  return {
    ...toUiAuction(a),
    startTime: Number(a.startTime),
    revealDeadline: Number(a.revealDeadline),
    createdAt: Number(a.createdAt),
    winner: r?.winner.toBase58(),
    winningAmount: r?.winningAmount.toNumber(),
  };
}

export function shortPubkey(pk: PublicKey | string): string {
  const s = typeof pk === "string" ? pk : pk.toBase58();
  return s.slice(0, 4) + "..." + s.slice(-4);
}
