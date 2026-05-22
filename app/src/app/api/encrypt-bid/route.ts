import * as anchor from "@coral-xyz/anchor";
import {
  RescueCipher,
  deserializeLE,
  getMXEPublicKey,
  x25519,
} from "@arcium-hq/client";
import { randomBytes, createHash } from "crypto";
import { NextResponse } from "next/server";
import { Keypair, PublicKey, Connection } from "@solana/web3.js";

function publicKeyToU128Halves(pubkey: PublicKey): [bigint, bigint] {
  const bytes = pubkey.toBytes();
  const lo = deserializeLE(bytes.slice(0, 16));
  const hi = deserializeLE(bytes.slice(16, 32));
  return [lo, hi];
}

async function getMxePublicKeyWithRetry(
  provider: anchor.AnchorProvider,
  programId: PublicKey,
  maxAttempts = 20,
): Promise<Uint8Array> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const mxePublicKey = await getMXEPublicKey(provider, programId);
    if (mxePublicKey) {
      return mxePublicKey;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error("Failed to fetch the MXE public key after multiple retries.");
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      amount: string;
      bidder: string;
      programId: string;
      signature: number[];
      submittedAt: string;
    };

    const bidder = new PublicKey(body.bidder);
    const programId = new PublicKey(body.programId);
    const signature = Uint8Array.from(body.signature);
    const privateKey = createHash("sha256").update(signature).digest().subarray(0, 32);
    const publicKey = x25519.getPublicKey(privateKey);
    const payer = anchor.Wallet.local
      ? anchor.Wallet.local()
      : new anchor.Wallet(Keypair.generate());
    const connection = new Connection(
      process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com",
      "confirmed",
    );
    const provider = new anchor.AnchorProvider(connection, payer, {
      commitment: "confirmed",
    });

    const mxePublicKey = await getMxePublicKeyWithRetry(provider, programId);
    const sharedSecret = x25519.getSharedSecret(privateKey, mxePublicKey);
    const cipher = new RescueCipher(sharedSecret);
    const nonceBytes = randomBytes(16);
    const [bidderLo, bidderHi] = publicKeyToU128Halves(bidder);
    const ciphertexts = cipher.encrypt(
      [
        bidderLo,
        bidderHi,
        BigInt(body.amount),
        BigInt(body.submittedAt),
        1n,
      ],
      nonceBytes,
    );

    return NextResponse.json({
      bidderX25519Pubkey: Array.from(publicKey),
      nonce: deserializeLE(nonceBytes).toString(),
      encryptedBidderLo: Array.from(ciphertexts[0]),
      encryptedBidderHi: Array.from(ciphertexts[1]),
      encryptedAmount: Array.from(ciphertexts[2]),
      encryptedSubmittedAt: Array.from(ciphertexts[3]),
      encryptedValid: Array.from(ciphertexts[4]),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to encrypt bid payload.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
