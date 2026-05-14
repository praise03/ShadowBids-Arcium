import { expect } from "chai";
import { Keypair } from "@solana/web3.js";
import { mockComputeWinner } from "./shadowbid-helpers";

describe("shadowbid deterministic e2e mock", () => {
  it("runs the full blind-auction lifecycle off-chain", () => {
    const creator = Keypair.generate();
    const bidderA = Keypair.generate();
    const bidderB = Keypair.generate();
    const auction = {
      creator: creator.publicKey,
      reservePrice: 100,
      status: "Live",
    };

    const bids = [
      { bidder: bidderA.publicKey, amount: 140, submittedAt: 10 },
      { bidder: bidderB.publicKey, amount: 220, submittedAt: 12 },
    ];

    auction.status = "Closed";
    auction.status = "Finalizing";
    const result = mockComputeWinner(bids, auction.reservePrice);
    auction.status = result.reserveMet ? "Finalized" : "ReserveNotMet";

    expect(auction.status).to.equal("Finalized");
    expect(result.winner.toBase58()).to.equal(bidderB.publicKey.toBase58());
    expect(result.winningAmount).to.equal(220);
  });

  it("handles reserve-not-met", () => {
    const result = mockComputeWinner([{ bidder: Keypair.generate().publicKey, amount: 90, submittedAt: 1 }], 100);
    expect(result.reserveMet).to.equal(false);
    expect(result.winningAmount).to.equal(0);
  });

  it("uses earliest submitted bid as deterministic tie-breaker", () => {
    const bidderA = Keypair.generate();
    const bidderB = Keypair.generate();
    const result = mockComputeWinner(
      [
        { bidder: bidderA.publicKey, amount: 200, submittedAt: 4 },
        { bidder: bidderB.publicKey, amount: 200, submittedAt: 3 },
      ],
      100,
    );
    expect(result.winner.toBase58()).to.equal(bidderB.publicKey.toBase58());
  });
});
