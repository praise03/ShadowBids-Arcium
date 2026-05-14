import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { createHash } from "crypto";

const ARCIUM_IDL = JSON.parse(readFileSync(join(process.cwd(), "node_modules/@arcium-hq/client/src/idl/arcium.json"), "utf-8"));
const SB = new PublicKey("F4tKBoryaS7kaQH2Hh1CxrQDRz4HRipVEztf5p5cT5wf");
const ARCIUM = new PublicKey("Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ");

async function main() {
  const conn = new Connection("https://api.devnet.solana.com", "confirmed");
  const payer = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(readFileSync(homedir() + "/.config/solana/id.json", "utf-8"))),
  );
  const prov = new anchor.AnchorProvider(conn, new anchor.Wallet(payer), { commitment: "confirmed" });
  anchor.setProvider(prov);
  const prog = new anchor.Program(ARCIUM_IDL as anchor.Idl, prov);

  const offset = createHash("sha256").update("compute_winner").digest().readUInt32LE(0);
  const offsetBuf = Buffer.alloc(4); offsetBuf.writeUInt32LE(offset, 0);
  const [mxePda] = PublicKey.findProgramAddressSync([Buffer.from("MXEAccount"), SB.toBuffer()], ARCIUM);
  const [compDefPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("ComputationDefinitionAccount"), SB.toBuffer(), offsetBuf], ARCIUM,
  );

  if (await conn.getAccountInfo(compDefPda)) {
    console.log("Comp def already exists");
    return;
  }

  const mxeAcc = await prog.account.mxeAccount.fetch(mxePda);
  const lutSlot = new anchor.BN((mxeAcc as any).lutOffsetSlot);
  const [lutAddr] = PublicKey.findProgramAddressSync(
    [mxePda.toBuffer(), lutSlot.toArrayLike(Buffer, "le", 8)],
    new PublicKey("AddressLookupTab1e1111111111111111111111111"),
  );

  console.log("Calling initComputationDefinition directly...");
  const tx = await prog.methods
    .initComputationDefinition(
      offset,
      SB,
      { circuitLen: 2269213, signature: { parameters: [], outputs: [] } },
      null,
      new anchor.BN(100000),
    )
    .accounts({
      signer: payer.publicKey,
      mxe: mxePda,
      compDefAcc: compDefPda,
      addressLookupTable: lutAddr,
      lutProgram: new PublicKey("AddressLookupTab1e1111111111111111111111111"),
      systemProgram: new PublicKey("11111111111111111111111111111111"),
    })
    .rpc();
  console.log("tx:", tx);
  console.log("Comp def initialized!");
}

main().catch(console.error);
