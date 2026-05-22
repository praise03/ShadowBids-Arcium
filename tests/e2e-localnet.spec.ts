import * as anchor from "@coral-xyz/anchor";
import { Program, Wallet } from "@coral-xyz/anchor";
import { Keypair, PublicKey, LAMPORTS_PER_SOL, Connection } from "@solana/web3.js";
import { expect } from "chai";
import { getMXEAccAddress, getMXEPublicKey } from "@arcium-hq/client";
import { commitmentForBid, encryptBidForArcium } from "./shadowbid-helpers";
import * as fs from "fs";
import * as path from "path";
import { homedir } from "os";
const idl = JSON.parse(fs.readFileSync(path.join(process.cwd(), "app/src/idl/shadow_bid.json"), "utf-8"));

const PROGRAM_ID = "F4tKBoryaS7kaQH2Hh1CxrQDRz4HRipVEztf5p5cT5wf";

function findPda(seeds: Buffer[], programId: PublicKey) {
  return PublicKey.findProgramAddressSync(seeds, programId);
}

describe("shadowbid localnet e2e", () => {
  const connection = new Connection("http://127.0.0.1:8899", "confirmed");
  const deployer = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(path.join(homedir(), ".config/solana/id.json"), "utf-8"))),
  );
  const wallet = new Wallet(deployer);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);

  const program = new Program(idl as anchor.Idl, provider);

  const bidderA = Keypair.generate();
  const bidderB = Keypair.generate();
  const pk = () => new PublicKey(PROGRAM_ID);
  let mxePublicKey: Uint8Array;

  // Track PDAs across tests
  let openAuctionPda: PublicKey;
  let endedAuctionPda: PublicKey;

  before(async () => {
    const mxeAccount = await provider.connection.getAccountInfo(getMXEAccAddress(pk()));
    if (!mxeAccount) {
      throw new Error(
        "Arcium localnet is not initialized on this validator. Run `bash scripts/start-localnet.sh` instead of plain `solana-test-validator`.",
      );
    }

    const sigA = await provider.connection.requestAirdrop(bidderA.publicKey, 10 * LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(sigA);
    const sigB = await provider.connection.requestAirdrop(bidderB.publicKey, 10 * LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(sigB);

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const key = await getMXEPublicKey(provider, pk());
      if (key) {
        mxePublicKey = key;
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    throw new Error("Failed to fetch MXE public key for localnet test.");
  });

  it("initializes the platform config", async () => {
    const [platformPda] = findPda([Buffer.from("platform")], pk());

    await program.methods
      .initializePlatform()
      .accounts({ authority: wallet.publicKey })
      .rpc();

    const config = await (program.account as any).platformConfig.fetch(platformPda);
    expect(config.authority.toBase58()).to.equal(wallet.publicKey.toBase58());
    expect(config.paused).to.equal(false);
  });

  it("creates an ended auction (past end_time for close testing)", async () => {
    const auctionId = new anchor.BN(1);
    const [auctionPda] = findPda(
      [Buffer.from("auction"), wallet.publicKey.toBuffer(), auctionId.toArrayLike(Buffer, "le", 8)],
      pk(),
    );
    const now = Math.floor(Date.now() / 1000);

    await program.methods
      .createAuction(
        auctionId,
        "Ended Auction",
        "Already ended",
        "SOL",
        new anchor.BN(100_000_000),
        new anchor.BN(10_000_000),
        new anchor.BN(now - 120),
        new anchor.BN(now - 60),
        new anchor.BN(now + 3600),
        { mock: {} },
      )
      .accounts({ creator: wallet.publicKey })
      .rpc();

    endedAuctionPda = auctionPda;
    const auction = await (program.account as any).auction.fetch(auctionPda);
    expect(auction.title).to.equal("Ended Auction");
  });

  it("creates an open auction (future end_time for bid submission)", async () => {
    const auctionId = new anchor.BN(2);
    const [auctionPda] = findPda(
      [Buffer.from("auction"), wallet.publicKey.toBuffer(), auctionId.toArrayLike(Buffer, "le", 8)],
      pk(),
    );
    const now = Math.floor(Date.now() / 1000);

    await program.methods
      .createAuction(
        auctionId,
        "Open Auction",
        "Still accepting bids",
        "SOL",
        new anchor.BN(100_000_000),
        new anchor.BN(10_000_000),
        new anchor.BN(now - 60),
        new anchor.BN(now + 3600),
        new anchor.BN(now + 7200),
        { mock: {} },
      )
      .accounts({ creator: wallet.publicKey })
      .rpc();

    openAuctionPda = auctionPda;
    const auction = await (program.account as any).auction.fetch(auctionPda);
    expect(auction.title).to.equal("Open Auction");
    expect(Object.keys(auction.status)[0]).to.equal("upcoming");
  });

  it("submits bids to the open auction", async () => {
    const submittedAt = Math.floor(Date.now() / 1000);
    const bidA = encryptBidForArcium({
      bidder: bidderA.publicKey,
      amount: 150_000_000,
      submittedAt,
      mxePublicKey,
    });

    // Submit bid from bidderA
    const commitA = commitmentForBid(openAuctionPda, bidderA.publicKey, 150_000_000);
    await program.methods
      .submitBidCommitment(
        Array.from(commitA),
        bidA.bidderX25519Pubkey,
        bidA.nonce,
        bidA.encryptedBidderLo,
        bidA.encryptedBidderHi,
        bidA.encryptedAmount,
        bidA.encryptedSubmittedAt,
        bidA.encryptedValid,
      )
      .accounts({ bidder: bidderA.publicKey, auction: openAuctionPda })
      .signers([bidderA])
      .rpc();

    const bidB = encryptBidForArcium({
      bidder: bidderB.publicKey,
      amount: 200_000_000,
      submittedAt: submittedAt + 1,
      mxePublicKey,
    });

    // Submit bid from bidderB
    const commitB = commitmentForBid(openAuctionPda, bidderB.publicKey, 200_000_000);
    await program.methods
      .submitBidCommitment(
        Array.from(commitB),
        bidB.bidderX25519Pubkey,
        bidB.nonce,
        bidB.encryptedBidderLo,
        bidB.encryptedBidderHi,
        bidB.encryptedAmount,
        bidB.encryptedSubmittedAt,
        bidB.encryptedValid,
      )
      .accounts({ bidder: bidderB.publicKey, auction: openAuctionPda })
      .signers([bidderB])
      .rpc();

    const auction = await (program.account as any).auction.fetch(openAuctionPda);
    expect(auction.bidCount).to.equal(2);
    expect(Object.keys(auction.status)[0]).to.equal("live");
  });

  it("closes the ended auction", async () => {
    await program.methods
      .closeBidding()
      .accounts({ closer: wallet.publicKey, auction: endedAuctionPda })
      .rpc();

    const closed = await (program.account as any).auction.fetch(endedAuctionPda);
    expect(Object.keys(closed.status)[0]).to.equal("closed");
  });

  it("rejects bids after closing", async () => {
    const commit = commitmentForBid(endedAuctionPda, Keypair.generate().publicKey, 50_000_000);
    const encrypted = encryptBidForArcium({
      bidder: wallet.publicKey,
      amount: 50_000_000,
      submittedAt: Math.floor(Date.now() / 1000),
      mxePublicKey,
    });
    try {
      await program.methods
        .submitBidCommitment(
          Array.from(commit),
          encrypted.bidderX25519Pubkey,
          encrypted.nonce,
          encrypted.encryptedBidderLo,
          encrypted.encryptedBidderHi,
          encrypted.encryptedAmount,
          encrypted.encryptedSubmittedAt,
          encrypted.encryptedValid,
        )
        .accounts({ bidder: wallet.publicKey, auction: endedAuctionPda })
        .rpc();
      expect.fail("Should have thrown");
    } catch {
      // expected
    }
  });
});
