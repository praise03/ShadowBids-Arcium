import * as anchor from "@coral-xyz/anchor";
import { Program, Wallet } from "@coral-xyz/anchor";
import { Keypair, PublicKey, LAMPORTS_PER_SOL, Connection } from "@solana/web3.js";
import { expect } from "chai";
import { commitmentForBid, encryptedBidPlaceholder } from "./shadowbid-helpers";
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

  // Track PDAs across tests
  let openAuctionPda: PublicKey;
  let endedAuctionPda: PublicKey;

  before(async () => {
    const sigA = await provider.connection.requestAirdrop(bidderA.publicKey, 10 * LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(sigA);
    const sigB = await provider.connection.requestAirdrop(bidderB.publicKey, 10 * LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(sigB);
  });

  it("initializes the platform config", async () => {
    const [platformPda] = findPda([Buffer.from("platform")], pk());

    await program.methods
      .initializePlatform()
      .accounts({ authority: wallet.publicKey })
      .rpc();

    const config = await program.account.platformConfig.fetch(platformPda);
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
    const auction = await program.account.auction.fetch(auctionPda);
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
    const auction = await program.account.auction.fetch(auctionPda);
    expect(auction.title).to.equal("Open Auction");
    expect(Object.keys(auction.status)[0]).to.equal("upcoming");
  });

  it("submits bids to the open auction", async () => {
    // Submit bid from bidderA
    const commitA = commitmentForBid(openAuctionPda, bidderA.publicKey, 150_000_000);
    await program.methods
      .submitBidCommitment(
        Array.from(commitA),
        Array.from(bidderA.secretKey.slice(0, 32)),
        new anchor.BN(12345),
        encryptedBidPlaceholder(150_000_000),
        encryptedBidPlaceholder(150_000_000),
        encryptedBidPlaceholder(150_000_000),
        encryptedBidPlaceholder(150_000_000),
        encryptedBidPlaceholder(1),
      )
      .accounts({ bidder: bidderA.publicKey, auction: openAuctionPda })
      .signers([bidderA])
      .rpc();

    // Submit bid from bidderB
    const commitB = commitmentForBid(openAuctionPda, bidderB.publicKey, 200_000_000);
    await program.methods
      .submitBidCommitment(
        Array.from(commitB),
        Array.from(bidderB.secretKey.slice(0, 32)),
        new anchor.BN(67890),
        encryptedBidPlaceholder(200_000_000),
        encryptedBidPlaceholder(200_000_000),
        encryptedBidPlaceholder(200_000_000),
        encryptedBidPlaceholder(200_000_000),
        encryptedBidPlaceholder(1),
      )
      .accounts({ bidder: bidderB.publicKey, auction: openAuctionPda })
      .signers([bidderB])
      .rpc();

    const auction = await program.account.auction.fetch(openAuctionPda);
    expect(auction.bidCount).to.equal(2);
    expect(Object.keys(auction.status)[0]).to.equal("live");
  });

  it("closes the ended auction", async () => {
    await program.methods
      .closeBidding()
      .accounts({ closer: wallet.publicKey, auction: endedAuctionPda })
      .rpc();

    const closed = await program.account.auction.fetch(endedAuctionPda);
    expect(Object.keys(closed.status)[0]).to.equal("closed");
  });

  it("rejects bids after closing", async () => {
    const commit = commitmentForBid(endedAuctionPda, Keypair.generate().publicKey, 50_000_000);
    try {
      await program.methods
        .submitBidCommitment(
          Array.from(commit),
          Array.from(Buffer.alloc(32)),
          new anchor.BN(99999),
          encryptedBidPlaceholder(50_000_000),
          encryptedBidPlaceholder(50_000_000),
          encryptedBidPlaceholder(50_000_000),
          encryptedBidPlaceholder(50_000_000),
          encryptedBidPlaceholder(1),
        )
        .accounts({ bidder: wallet.publicKey, auction: endedAuctionPda })
        .rpc();
      expect.fail("Should have thrown");
    } catch {
      // expected
    }
  });
});
