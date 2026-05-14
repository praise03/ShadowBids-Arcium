import { createHash, randomBytes } from "crypto";
import { Keypair, PublicKey } from "@solana/web3.js";

export type MockBid = {
  bidder: PublicKey;
  amount: number;
  submittedAt: number;
};

export function commitmentForBid(auction: PublicKey, bidder: PublicKey, amount: number, salt = randomBytes(16)): Buffer {
  return createHash("sha256")
    .update("shadowbid:v1")
    .update(auction.toBuffer())
    .update(bidder.toBuffer())
    .update(Buffer.from(amount.toString()))
    .update(salt)
    .digest();
}

export function encryptedBidPlaceholder(amount: number): number[] {
  const digest = createHash("sha256").update(`encrypted:${amount}`).digest();
  return Array.from(digest);
}

export function mockComputeWinner(bids: MockBid[], reservePrice: number) {
  const valid = bids.filter((bid) => bid.amount >= reservePrice);
  valid.sort((left, right) => {
    if (right.amount !== left.amount) return right.amount - left.amount;
    return left.submittedAt - right.submittedAt;
  });
  const winner = valid[0];
  return {
    winner: winner?.bidder ?? PublicKey.default,
    winningAmount: winner?.amount ?? 0,
    winningBidSubmittedAt: winner?.submittedAt ?? 0,
    reserveMet: Boolean(winner),
    bidCount: bids.length,
  };
}

export function bidder(): Keypair {
  return Keypair.generate();
}
