import * as anchor from "@coral-xyz/anchor";
const BN = anchor.BN;
const Program = anchor.Program;
const Wallet = anchor.Wallet;
import { Keypair, PublicKey, LAMPORTS_PER_SOL, Connection, AddressLookupTableProgram } from "@solana/web3.js";
import { expect } from "chai";
import { createHash, randomBytes } from "crypto";
import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import {
  awaitComputationFinalization,
  getArciumProgramId,
  getClockAccAddress,
  getClusterAccAddress,
  getCompDefAccAddress,
  getCompDefAccOffset,
  getComputationAccAddress,
  getExecutingPoolAccAddress,
  getFeePoolAccAddress,
  getLookupTableAddress,
  getMXEAccAddress,
  getMXEPublicKey,
  getMempoolAccAddress,
} from "@arcium-hq/client";
import { encryptBidForArcium } from "./shadowbid-helpers";

const idl = JSON.parse(readFileSync(join(process.cwd(), "app/src/idl/shadow_bid.json"), "utf-8"));

const SHADOWBID_PROGRAM_ID = new PublicKey("F4tKBoryaS7kaQH2Hh1CxrQDRz4HRipVEztf5p5cT5wf");

function findPda(seeds: Buffer[], programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(seeds, programId);
}

function findAuctionPda(creator: PublicKey, id: anchor.BN): [PublicKey, number] {
  return findPda(
    [Buffer.from("auction"), creator.toBuffer(), id.toArrayLike(Buffer, "le", 8)],
    SHADOWBID_PROGRAM_ID,
  );
}

function findResultPda(auction: PublicKey): [PublicKey, number] {
  return findPda([Buffer.from("result"), auction.toBuffer()], SHADOWBID_PROGRAM_ID);
}

function findBidPda(auction: PublicKey, bidder: PublicKey): [PublicKey, number] {
  return findPda([Buffer.from("bid"), auction.toBuffer(), bidder.toBuffer()], SHADOWBID_PROGRAM_ID);
}

function findPlatformPda(): [PublicKey, number] {
  return findPda([Buffer.from("platform")], SHADOWBID_PROGRAM_ID);
}

function findSignPda(): [PublicKey, number] {
  return findPda([Buffer.from("ArciumSignerAccount")], SHADOWBID_PROGRAM_ID);
}

function findCompDefPda(mxeProgramId: PublicKey, compDefOffset: number): [PublicKey, number] {
  const offsetBuf = Buffer.alloc(4);
  offsetBuf.writeUInt32LE(compDefOffset, 0);
  return findPda(
    [Buffer.from("ComputationDefinitionAccount"), mxeProgramId.toBuffer(), offsetBuf],
    getArciumProgramId(),
  );
}

function computeCompDefOffset(circuitName: string): number {
  return createHash("sha256").update(circuitName).digest().readUInt32LE(0);
}

function makeCommitment(auction: PublicKey, bidder: PublicKey, amount: number): number[] {
  const salt = randomBytes(16);
  const hash = createHash("sha256")
    .update("shadowbid:v1")
    .update(auction.toBuffer())
    .update(bidder.toBuffer())
    .update(Buffer.from(amount.toString()))
    .update(salt)
    .digest();
  return Array.from(hash);
}

const COMP_DEF_OFFSET = computeCompDefOffset("compute_winner");
const [COMP_DEF_PDA] = findCompDefPda(SHADOWBID_PROGRAM_ID, COMP_DEF_OFFSET);
const [SIGN_PDA] = findSignPda();

describe("shadowbid compute flow", () => {
  const connection = new Connection("http://127.0.0.1:8899", "confirmed");
  const deployer = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(readFileSync(homedir() + "/.config/solana/id.json", "utf-8"))),
  );
  const wallet = new Wallet(deployer);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);

  const program = new Program(idl as anchor.Idl, provider);

  const BIDDER_COUNT = 8;
  const bidders: Keypair[] = [];
  let mxePublicKey: Uint8Array;
  let mxePda: PublicKey;
  let clusterOffset: number;
  let arciumProgramId: PublicKey;
  let mempoolPda: PublicKey;
  let executingPoolPda: PublicKey;
  let clusterPda: PublicKey;
  let feePoolPda: PublicKey;
  let clockPda: PublicKey;
  let lutPda: PublicKey;

  let computeAuctionPda: PublicKey;
  let computeResultPda: PublicKey;
  let bidPdas: PublicKey[];

  before(async function () {
    this.timeout(60_000);
    arciumProgramId = getArciumProgramId();
    mxePda = getMXEAccAddress(SHADOWBID_PROGRAM_ID);
    const mxeAccountInfo = await provider.connection.getAccountInfo(mxePda);
    if (!mxeAccountInfo) {
      throw new Error(
        "Arcium localnet is not initialized on this validator. Run `bash scripts/start-localnet.sh tests/e2e-compute-flow.spec.ts` instead of plain `solana-test-validator`.",
      );
    }

    const rawArciumProgram = new Program(
      JSON.parse(readFileSync(join(process.cwd(), "node_modules/@arcium-hq/client/src/idl/arcium.json"), "utf-8")) as anchor.Idl,
      provider,
    );
    const mxeAccount = await (rawArciumProgram.account as any).mxeAccount.fetch(mxePda);
    clusterOffset = new BN((mxeAccount as any).cluster).toNumber();
    mempoolPda = getMempoolAccAddress(clusterOffset);
    executingPoolPda = getExecutingPoolAccAddress(clusterOffset);
    clusterPda = getClusterAccAddress(clusterOffset);
    feePoolPda = getFeePoolAccAddress();
    clockPda = getClockAccAddress();
    lutPda = getLookupTableAddress(
      SHADOWBID_PROGRAM_ID,
      new BN((mxeAccount as any).lutOffsetSlot),
    );

    for (let i = 0; i < BIDDER_COUNT; i++) {
      const kp = Keypair.generate();
      bidders.push(kp);
      const sig = await provider.connection.requestAirdrop(kp.publicKey, 10 * LAMPORTS_PER_SOL);
      await provider.connection.confirmTransaction(sig);
    }

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const key = await getMXEPublicKey(provider, SHADOWBID_PROGRAM_ID);
      if (key) {
        mxePublicKey = key;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!mxePublicKey) {
      throw new Error("Failed to fetch MXE public key for compute-flow test.");
    }
  });

  it("initializes platform config", async () => {
    const [platformPda] = findPlatformPda();
    const existing = await (program.account as any).platformConfig.fetchNullable(platformPda);
    if (existing) return;

    await program.methods
      .initializePlatform()
      .accounts({ authority: deployer.publicKey })
      .rpc();

    const config = await (program.account as any).platformConfig.fetch(platformPda);
    expect(config.authority.toBase58()).to.equal(deployer.publicKey.toBase58());
  });

  it("initializes compute winner computation definition", async function () {
    this.timeout(30_000);

    const existing = await provider.connection.getAccountInfo(COMP_DEF_PDA);
    if (existing) {
      console.log("  comp def already initialized, skipping");
      return;
    }

    await program.methods
      .initComputeWinnerCompDef()
      .accounts({
        payer: deployer.publicKey,
        mxeAccount: mxePda,
        compDefAccount: COMP_DEF_PDA,
        addressLookupTable: lutPda,
        lutProgram: AddressLookupTableProgram.programId,
        arciumProgram: arciumProgramId,
      })
      .rpc();
  });

  it("creates auction, submits 8 bids, closes, triggers compute, and settles", async function () {
    this.timeout(180_000);

    const slot = await connection.getSlot({ commitment: "confirmed" });
    const blockTime = await connection.getBlockTime(slot);
    // Use block time to stay in sync with the validator's clock
    const now = blockTime ?? Math.floor(Date.now() / 1000);
    const startTime = now - 300;
    const endTime = now + 15;
    const settlementDeadline = now + 3600;
    const auctionId = new BN(200 + Math.floor(Math.random() * 1000));

    const [auctionPda] = findAuctionPda(deployer.publicKey, auctionId);
    computeAuctionPda = auctionPda;
    const [resultPda] = findResultPda(computeAuctionPda);
    computeResultPda = resultPda;

    await program.methods
      .createAuction(
        auctionId,
        "Compute Flow Test",
        "Testing full confidential compute flow",
        "SOL",
        new BN(100_000_000),
        new BN(10_000_000),
        new BN(startTime),
        new BN(endTime),
        new BN(settlementDeadline),
        { mock: {} },
      )
      .accounts({ creator: deployer.publicKey })
      .rpc();

    const created = await (program.account as any).auction.fetch(computeAuctionPda);
    expect(created.title).to.equal("Compute Flow Test");

    const amounts = bidders.map((_, i) => 100_000_000 + i * 10_000_000);

    await Promise.all(
      bidders.map((bidder, i) => {
        const encrypted = encryptBidForArcium({
          bidder: bidder.publicKey,
          amount: amounts[i],
          submittedAt: now + i,
          mxePublicKey,
        });

        return program.methods
          .submitBidCommitment(
            makeCommitment(computeAuctionPda, bidder.publicKey, amounts[i]),
            encrypted.bidderX25519Pubkey,
            encrypted.nonce,
            encrypted.encryptedBidderLo,
            encrypted.encryptedBidderHi,
            encrypted.encryptedAmount,
            encrypted.encryptedSubmittedAt,
            encrypted.encryptedValid,
          )
          .accounts({ bidder: bidder.publicKey, auction: computeAuctionPda })
          .signers([bidder])
          .rpc();
      }),
    );

    const afterBids = await (program.account as any).auction.fetch(computeAuctionPda);
    expect(afterBids.bidCount).to.equal(BIDDER_COUNT);

    bidPdas = bidders.map((b) => findBidPda(computeAuctionPda, b.publicKey)[0]);

    // Wait for block time to pass end_time
    const waitStart = Date.now();
    while (true) {
      const currentSlot = await connection.getSlot({ commitment: "confirmed" });
      const currentBlockTime = await connection.getBlockTime(currentSlot);
      if (currentBlockTime && currentBlockTime > endTime) break;
      const elapsed = Math.floor((Date.now() - waitStart) / 1000);
      console.log(`  waiting (block=${currentBlockTime}, end=${endTime}, elapsed=${elapsed}s)...`);
      await new Promise((r) => setTimeout(r, 3000));
      if (elapsed > 60) throw new Error("Timeout waiting for end_time");
    }

    await program.methods
      .closeBidding()
      .accounts({ closer: deployer.publicKey, auction: computeAuctionPda })
      .rpc();

    const closed = await (program.account as any).auction.fetch(computeAuctionPda);
    expect(Object.keys(closed.status)[0]).to.equal("closed");

    const computationOffset = new BN(Date.now() % 100000);
    await program.methods
      .triggerConfidentialCompute(computationOffset)
      .accounts({
        payer: deployer.publicKey,
        signPdaAccount: SIGN_PDA,
        auction: computeAuctionPda,
        result: computeResultPda,
        mxeAccount: mxePda,
        mempoolAccount: mempoolPda,
        executingPool: executingPoolPda,
        computationAccount: getComputationAccAddress(clusterOffset, computationOffset),
        compDefAccount: COMP_DEF_PDA,
        clusterAccount: clusterPda,
        poolAccount: feePoolPda,
        clockAccount: clockPda,
        arciumProgram: arciumProgramId,
      })
      .remainingAccounts(
        bidPdas.map((pda) => ({ pubkey: pda, isWritable: false, isSigner: false })),
      )
      .rpc();

    const finalizing = await (program.account as any).auction.fetch(computeAuctionPda);
    expect(Object.keys(finalizing.status)[0]).to.equal("finalizing");

    console.log("  waiting for computation to finalize...");
    await awaitComputationFinalization(
      provider,
      computationOffset,
      SHADOWBID_PROGRAM_ID,
      "confirmed",
      120_000,
    );
    await new Promise((r) => setTimeout(r, 3000));

    const auctionAfter = await (program.account as any).auction.fetch(computeAuctionPda);
    const statusKey = Object.keys(auctionAfter.status)[0];
    console.log(`  auction status after compute: ${statusKey}`);

    expect(["finalized", "reserveNotMet"]).to.include(statusKey);

    const result = await (program.account as any).auctionResult.fetch(computeResultPda);
    expect(result.finalized).to.be.true;
    console.log(`  winner: ${result.winner.toBase58()}, amount: ${result.winningAmount}`);

    await program.methods
      .markSettlementCompleted()
      .accounts({ creator: deployer.publicKey, auction: computeAuctionPda })
      .rpc();

    const settled = await (program.account as any).auction.fetch(computeAuctionPda);
    expect(settled.settlementCompleted).to.be.true;
    console.log("  settlement completed");
  });
});
