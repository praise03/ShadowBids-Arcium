import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { createHash } from "crypto";

const IDL = JSON.parse(readFileSync(join(process.cwd(), "node_modules/@arcium-hq/client/src/idl/arcium.json"), "utf-8"));
const SB = new PublicKey("F4tKBoryaS7kaQH2Hh1CxrQDRz4HRipVEztf5p5cT5wf");
const ARCIUM = new PublicKey("Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ");

async function main() {
  const conn = new Connection("https://api.devnet.solana.com", "confirmed");
  const payer = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(readFileSync(homedir() + "/.config/solana/id.json", "utf-8"))),
  );
  const prov = new anchor.AnchorProvider(conn, new anchor.Wallet(payer), { commitment: "confirmed" });
  anchor.setProvider(prov);
  const prog = new anchor.Program(IDL as anchor.Idl, prov);

  const offset = createHash("sha256").update("compute_winner").digest().readUInt32LE(0);
  const offsetBuf = Buffer.alloc(4); offsetBuf.writeUInt32LE(offset, 0);
  const [mxePda] = PublicKey.findProgramAddressSync([Buffer.from("MXEAccount"), SB.toBuffer()], ARCIUM);
  const [compDefPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("ComputationDefinitionAccount"), SB.toBuffer(), offsetBuf], ARCIUM,
  );
  const [rawPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("ComputationDefinitionRaw"), compDefPda.toBuffer(), Buffer.from([0])],
    ARCIUM,
  );

  console.log("Closing raw circuit acc:", rawPda.toBase58());
  const acc = await conn.getAccountInfo(rawPda);
  if (!acc) { console.log("Already closed"); return; }
  console.log("Balance:", acc.lamports / 1e9, "SOL");

  await prog.methods.closeComputationDefinitionBuffers(offset, SB, 0)
    .accounts({ signer: payer.publicKey, mxe: mxePda, compDefAcc: compDefPda, compDefRaw: rawPda })
    .rpc().then(t => console.log("Closed:", t));
}

main().catch(console.error);
