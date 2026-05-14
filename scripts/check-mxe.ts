import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

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

  const [mxePda] = PublicKey.findProgramAddressSync([Buffer.from("MXEAccount"), SB.toBuffer()], ARCIUM);
  const mxe = await prog.account.mxeAccount.fetch(mxePda);
  console.log("MXE status:", JSON.stringify(mxe.status));
  console.log("cluster:", mxe.cluster);
  console.log("keygenOffset:", mxe.keygenOffset.toString());
  console.log("keyRecoveryInitOffset:", mxe.keyRecoveryInitOffset.toString());
  console.log("mxeProgramId:", (mxe as any).mxeProgramId?.toBase58?.());
  console.log("utilityPubkeys:", JSON.stringify((mxe as any).utilityPubkeys));
  console.log("computationDefinitions:", JSON.stringify((mxe as any).computationDefinitions));
  console.log("lutOffsetSlot:", (mxe as any).lutOffsetSlot?.toString?.());
}

main().catch(console.error);
