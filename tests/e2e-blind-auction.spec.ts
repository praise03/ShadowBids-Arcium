import * as fs from "fs";
import * as path from "path";

import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";

describe("shadowbid arcium-native e2e scaffold", () => {
  it("exposes the native confidential-compute entrypoints in the generated artifacts", () => {
    const circuitPath = path.resolve("build/compute_winner.ts");
    const deployPath = path.resolve("target/deploy/shadow_bid.so");
    const programSourcePath = path.resolve("programs/shadow_bid/src/lib.rs");
    const computeSourcePath = path.resolve("programs/shadow_bid/src/instructions/compute_winner.rs");

    expect(fs.existsSync(circuitPath), "missing canonical generated Arcium circuit artifact").to.equal(
      true,
    );
    expect(fs.existsSync(deployPath), "missing compiled Solana program").to.equal(true);
    expect(fs.existsSync(programSourcePath), "missing Arcium-native program source").to.equal(
      true,
    );
    expect(fs.existsSync(computeSourcePath), "missing confidential-compute instruction source").to.equal(
      true,
    );

    const programSource = fs.readFileSync(programSourcePath, "utf8");
    const computeSource = fs.readFileSync(computeSourcePath, "utf8");
    const circuitArtifact = fs.readFileSync(circuitPath, "utf8");

    expect(programSource).to.include("#[arcium_program]");
    expect(programSource).to.include("init_compute_winner_comp_def");
    expect(programSource).to.include('#[arcium_callback(encrypted_ix = "compute_winner")]');
    expect(computeSource).to.include("queue_computation");
    expect(computeSource).to.include(".verify_output(");
    expect(circuitArtifact).to.include("compute_winner");
  });

  it("documents the real localnet flow and only runs it when explicitly enabled", async function () {
    if (process.env.SHADOWBID_RUN_REAL_E2E !== "1") {
      this.skip();
    }

    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    const program = anchor.workspace.ShadowBid as anchor.Program;

    expect(program.programId.toBase58()).to.match(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);

    // The real flow is intentionally gated because it depends on a live Arcium localnet,
    // MXE public key availability, and client-side RescueCipher input generation.
    // Use this assertion as a smoke check that the native program is loaded before
    // extending this test into a full encryption + queue_computation integration flow.
    expect(program.idl.instructions.some((ix) => ix.name === "triggerConfidentialCompute")).to.equal(
      true,
    );
  });
});
