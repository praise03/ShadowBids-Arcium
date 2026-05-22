import { createHash, randomBytes } from "crypto";
import { deserializeLE, RescueCipher, x25519 } from "@arcium-hq/client";
import BN from "bn.js";
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

function publicKeyToU128Halves(pubkey: PublicKey): [bigint, bigint] {
  const bytes = pubkey.toBytes();
  return [
    deserializeLE(bytes.slice(0, 16)),
    deserializeLE(bytes.slice(16, 32)),
  ];
}

export function encryptBidForArcium(args: {
  bidder: PublicKey;
  amount: number;
  submittedAt: number;
  mxePublicKey: Uint8Array;
  x25519PrivateKey?: Uint8Array;
}) {
  const privateKey =
    args.x25519PrivateKey ??
    (x25519.utils.randomSecretKey
      ? x25519.utils.randomSecretKey()
      : x25519.utils.randomPrivateKey());
  const publicKey = x25519.getPublicKey(privateKey);
  const sharedSecret = x25519.getSharedSecret(privateKey, args.mxePublicKey);
  const cipher = new RescueCipher(sharedSecret);
  const nonceBytes = randomBytes(16);
  const [bidderLo, bidderHi] = publicKeyToU128Halves(args.bidder);
  const ciphertexts = cipher.encrypt(
    [
      bidderLo,
      bidderHi,
      BigInt(args.amount),
      BigInt(args.submittedAt),
      1n,
    ],
    nonceBytes,
  );

  return {
    bidderX25519Pubkey: Array.from(publicKey),
    nonce: new BN(deserializeLE(nonceBytes).toString()),
    encryptedBidderLo: Array.from(ciphertexts[0]),
    encryptedBidderHi: Array.from(ciphertexts[1]),
    encryptedAmount: Array.from(ciphertexts[2]),
    encryptedSubmittedAt: Array.from(ciphertexts[3]),
    encryptedValid: Array.from(ciphertexts[4]),
  };
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
