import { PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import type { ShadowBid } from "../idl/shadow_bid-types";
import idl from "../idl/shadow_bid.json";

export type AuctionData = {
  pubkey: PublicKey;
  id: anchor.BN;
  creator: PublicKey;
  title: string;
  description: string;
  assetSymbol: string;
  reservePrice: anchor.BN;
  minBidIncrement: anchor.BN;
  startTime: anchor.BN;
  endTime: anchor.BN;
  revealDeadline: anchor.BN;
  settlementMode: object;
  status: AuctionStatusVariant;
  bidCount: number;
  settlementCompleted: boolean;
  createdAt: anchor.BN;
};

export type AuctionStatusVariant =
  | { upcoming: Record<string, never> }
  | { live: Record<string, never> }
  | { closed: Record<string, never> }
  | { finalizing: Record<string, never> }
  | { finalized: Record<string, never> }
  | { reserveNotMet: Record<string, never> }
  | { failed: Record<string, never> }
  | { cancelled: Record<string, never> };

export type AuctionResultData = {
  pubkey: PublicKey;
  auction: PublicKey;
  winner: PublicKey;
  winningAmount: anchor.BN;
  winningBidSubmittedAt: anchor.BN;
  reserveMet: boolean;
  bidCount: number;
  finalized: boolean;
  finalizedAt: anchor.BN;
};

export function statusLabel(status: AuctionStatusVariant): string {
  if ("upcoming" in status) return "upcoming";
  if ("live" in status) return "live";
  if ("closed" in status) return "closed";
  if ("finalizing" in status) return "finalizing";
  if ("finalized" in status) return "finalized";
  if ("reserveNotMet" in status) return "reserve-not-met";
  if ("failed" in status) return "failed";
  if ("cancelled" in status) return "cancelled";
  return "unknown";
}

export const SEEDS = {
  platform: Buffer.from("platform"),
  auction: Buffer.from("auction"),
  result: Buffer.from("result"),
  bid: Buffer.from("bid"),
  userStats: Buffer.from("user-stats"),
} as const;

export function findAuctionPda(creator: PublicKey, id: anchor.BN, programId: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [SEEDS.auction, creator.toBuffer(), id.toArrayLike(Buffer, "le", 8)],
    programId,
  );
}

export function findResultPda(auction: PublicKey, programId: PublicKey) {
  return PublicKey.findProgramAddressSync([SEEDS.result, auction.toBuffer()], programId);
}

export function findBidPda(auction: PublicKey, bidder: PublicKey, programId: PublicKey) {
  return PublicKey.findProgramAddressSync([SEEDS.bid, auction.toBuffer(), bidder.toBuffer()], programId);
}

export function findUserStatsPda(owner: PublicKey, programId: PublicKey) {
  return PublicKey.findProgramAddressSync([SEEDS.userStats, owner.toBuffer()], programId);
}

export function findPlatformPda(programId: PublicKey) {
  return PublicKey.findProgramAddressSync([SEEDS.platform], programId);
}

export function getProgram(provider: anchor.AnchorProvider): anchor.Program<ShadowBid> {
  return new anchor.Program<ShadowBid>(idl as ShadowBid, provider);
}

export const PROGRAM_ID = new PublicKey("F4tKBoryaS7kaQH2Hh1CxrQDRz4HRipVEztf5p5cT5wf");
