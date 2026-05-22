import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { uploadCircuit } from "@arcium-hq/client";
import { createHash } from "crypto";

const SB = new PublicKey("F4tKBoryaS7kaQH2Hh1CxrQDRz4HRipVEztf5p5cT5wf");
const ARCIUM = new PublicKey("Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ");
const LUT_PROG = new PublicKey("AddressLookupTab1e1111111111111111111111111");

const idl = JSON.parse(readFileSync(join(process.cwd(), "app/src/idl/shadow_bid.json"), "utf-8"));

function compDefOffset(name: string): number {
  return createHash("sha256").update(name).digest().readUInt32LE(0);
}

async function main() {
  const conn = new Connection("https://api.devnet.solana.com", "confirmed");
  const payer = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(readFileSync(homedir() + "/.config/solana/id.json", "utf-8"))),
  );
  const prov = new anchor.AnchorProvider(conn, new anchor.Wallet(payer), { commitment: "confirmed" });
  anchor.setProvider(prov);
  const prog = new anchor.Program(idl as anchor.Idl, prov);

  const offset = compDefOffset("compute_winner");
  const offsetBuf = Buffer.alloc(4); offsetBuf.writeUInt32LE(offset, 0);
  const [mxePda] = PublicKey.findProgramAddressSync([Buffer.from("MXEAccount"), SB.toBuffer()], ARCIUM);
  const [compDefPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("ComputationDefinitionAccount"), SB.toBuffer(), offsetBuf], ARCIUM,
  );

  // Derive LUT from MXE
  const arciumIdl = JSON.parse(readFileSync(join(process.cwd(), "node_modules/@arcium-hq/client/src/idl/arcium.json"), "utf-8"));
  const arciumProg = new anchor.Program(arciumIdl as anchor.Idl, prov);
  const mxeAcc = await (arciumProg.account as any).mxeAccount.fetch(mxePda);
  const lutSlot = new anchor.BN((mxeAcc as any).lutOffsetSlot);
  const [lutAddr] = PublicKey.findProgramAddressSync(
    [mxePda.toBuffer(), lutSlot.toArrayLike(Buffer, "le", 8)], LUT_PROG,
  );

  console.log("Comp def:", compDefPda.toBase58());
  console.log("LUT:", lutAddr.toBase58());

  // Init comp def via upgraded program
  if (!await conn.getAccountInfo(compDefPda)) {
    console.log("Initing comp def...");
    const tx = await prog.methods.initComputeWinnerCompDef()
      .accounts({
        payer: payer.publicKey,
        mxeAccount: mxePda,
        compDefAccount: compDefPda,
        addressLookupTable: lutAddr,
        lutProgram: LUT_PROG,
        arciumProgram: ARCIUM,
      })
      .rpc();
    console.log("tx:", tx);
  } else {
    console.log("Comp def exists");
  }

  // Upload circuit
  console.log("Uploading circuit...");
  const data = readFileSync(join(process.cwd(), "build/compute_winner.arcis"));
  console.log("Size:", data.length, "bytes");
  const sigs = await uploadCircuit(prov, "compute_winner", SB, new Uint8Array(data), true, 100);
  console.log("Done! Txs:", sigs.length);
}

main().catch(console.error);
