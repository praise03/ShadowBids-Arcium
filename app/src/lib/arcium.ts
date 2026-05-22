import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import arciumIdl from "../../../node_modules/@arcium-hq/client/src/idl/arcium.json";

const ENCRYPTION_MESSAGE_PREFIX = "ShadowBid Arcium encryption key for ";
const OFFSET_BUFFER_SIZE = 4;
const CLOCK_ACC_SEED = "ClockAccount";
const POOL_ACC_SEED = "FeePool";
const COMPUTATION_ACC_SEED = "ComputationAccount";
const MEMPOOL_ACC_SEED = "Mempool";
const EXEC_POOL_ACC_SEED = "Execpool";
const CLUSTER_ACC_SEED = "Cluster";
const MXE_ACCOUNT_SEED = "MXEAccount";
const COMP_DEF_ACC_SEED = "ComputationDefinitionAccount";
const COMP_DEF_OFFSET_COMPUTE_WINNER = 3303274052;

const ARCIUM_PROGRAM_ID = new PublicKey((arciumIdl as { address: string }).address);

export type WalletWithSignMessage = {
  signMessage?: (message: Uint8Array) => Promise<Uint8Array>;
};

export type EncryptedBidPayload = {
  bidderX25519Pubkey: number[];
  nonce: anchor.BN;
  encryptedBidderLo: number[];
  encryptedBidderHi: number[];
  encryptedAmount: number[];
  encryptedSubmittedAt: number[];
  encryptedValid: number[];
};

function offsetBuffer(offset: number): Buffer {
  const buffer = Buffer.alloc(OFFSET_BUFFER_SIZE);
  buffer.writeUInt32LE(offset, 0);
  return buffer;
}

function getArciumProgramId(): PublicKey {
  return ARCIUM_PROGRAM_ID;
}

function generateArciumPda(seeds: Buffer[]): PublicKey {
  return PublicKey.findProgramAddressSync(seeds, getArciumProgramId())[0];
}

async function sha256Bytes(input: Uint8Array): Promise<Uint8Array> {
  const buffer = input.buffer.slice(
    input.byteOffset,
    input.byteOffset + input.byteLength,
  ) as ArrayBuffer;
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return new Uint8Array(digest);
}

export function getArciumProgram(provider: anchor.AnchorProvider) {
  return new anchor.Program(arciumIdl as anchor.Idl, provider);
}

export function getClockAccAddress(): PublicKey {
  return generateArciumPda([Buffer.from(CLOCK_ACC_SEED)]);
}

export function getFeePoolAccAddress(): PublicKey {
  return generateArciumPda([Buffer.from(POOL_ACC_SEED)]);
}

export function getClusterAccAddress(clusterOffset: number): PublicKey {
  return generateArciumPda([
    Buffer.from(CLUSTER_ACC_SEED),
    offsetBuffer(clusterOffset),
  ]);
}

export function getComputationAccAddress(
  clusterOffset: number,
  computationOffset: anchor.BN,
): PublicKey {
  return generateArciumPda([
    Buffer.from(COMPUTATION_ACC_SEED),
    offsetBuffer(clusterOffset),
    computationOffset.toArrayLike(Buffer, "le", 8),
  ]);
}

export function getMempoolAccAddress(clusterOffset: number): PublicKey {
  return generateArciumPda([
    Buffer.from(MEMPOOL_ACC_SEED),
    offsetBuffer(clusterOffset),
  ]);
}

export function getExecutingPoolAccAddress(clusterOffset: number): PublicKey {
  return generateArciumPda([
    Buffer.from(EXEC_POOL_ACC_SEED),
    offsetBuffer(clusterOffset),
  ]);
}

export function getMXEAccAddress(mxeProgramId: PublicKey): PublicKey {
  return generateArciumPda([
    Buffer.from(MXE_ACCOUNT_SEED),
    mxeProgramId.toBuffer(),
  ]);
}

export function getCompDefAccAddress(
  mxeProgramId: PublicKey,
  compDefOffset: number,
): PublicKey {
  return generateArciumPda([
    Buffer.from(COMP_DEF_ACC_SEED),
    mxeProgramId.toBuffer(),
    offsetBuffer(compDefOffset),
  ]);
}

export function getCompDefAccOffset(name: string): number {
  if (name !== "compute_winner") {
    throw new Error(`Unsupported computation definition lookup: ${name}`);
  }
  return COMP_DEF_OFFSET_COMPUTE_WINNER;
}

export async function buildBidCommitment(
  auction: PublicKey,
  bidder: PublicKey,
  amount: bigint,
): Promise<number[]> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const amountBytes = encoder.encode(amount.toString());
  const payload = new Uint8Array(
    "shadowbid:v1".length + 32 + 32 + amountBytes.length + salt.length,
  );

  let offset = 0;
  payload.set(encoder.encode("shadowbid:v1"), offset);
  offset += "shadowbid:v1".length;
  payload.set(auction.toBytes(), offset);
  offset += 32;
  payload.set(bidder.toBytes(), offset);
  offset += 32;
  payload.set(amountBytes, offset);
  offset += amountBytes.length;
  payload.set(salt, offset);

  return Array.from(await sha256Bytes(payload));
}

export async function encryptBidForSubmission(args: {
  wallet: WalletWithSignMessage;
  programId: PublicKey;
  bidder: PublicKey;
  amount: bigint;
  submittedAt?: bigint;
}): Promise<EncryptedBidPayload> {
  if (!args.wallet.signMessage) {
    throw new Error("This wallet does not support signMessage, which ShadowBid needs for Arcium encryption.");
  }

  const encoder = new TextEncoder();
  const message = encoder.encode(
    `${ENCRYPTION_MESSAGE_PREFIX}${args.programId.toBase58()}`,
  );
  const signature = await args.wallet.signMessage(message);
  const submittedAt =
    args.submittedAt ?? BigInt(Math.floor(Date.now() / 1000));

  const response = await fetch("/api/encrypt-bid", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: args.amount.toString(),
      bidder: args.bidder.toBase58(),
      programId: args.programId.toBase58(),
      signature: Array.from(signature),
      submittedAt: submittedAt.toString(),
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(payload?.error ?? "Failed to encrypt bid payload.");
  }

  const payload = (await response.json()) as {
    bidderX25519Pubkey: number[];
    nonce: string;
    encryptedBidderLo: number[];
    encryptedBidderHi: number[];
    encryptedAmount: number[];
    encryptedSubmittedAt: number[];
    encryptedValid: number[];
  };

  return {
    bidderX25519Pubkey: payload.bidderX25519Pubkey,
    nonce: new anchor.BN(payload.nonce),
    encryptedBidderLo: payload.encryptedBidderLo,
    encryptedBidderHi: payload.encryptedBidderHi,
    encryptedAmount: payload.encryptedAmount,
    encryptedSubmittedAt: payload.encryptedSubmittedAt,
    encryptedValid: payload.encryptedValid,
  };
}
