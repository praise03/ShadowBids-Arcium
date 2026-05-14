import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const idl = JSON.parse(readFileSync(join(process.cwd(), "app/src/idl/shadow_bid.json"), "utf-8"));
const PROGRAM_ID = new PublicKey("F4tKBoryaS7kaQH2Hh1CxrQDRz4HRipVEztf5p5cT5wf");

async function main() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const deployer = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(readFileSync(homedir() + "/.config/solana/id.json", "utf-8"))),
  );
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(deployer), { commitment: "confirmed" });
  anchor.setProvider(provider);
  const program = new anchor.Program(idl as anchor.Idl, provider);

  const [platformPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("platform")],
    PROGRAM_ID,
  );
  const existing = await program.account.platformConfig.fetchNullable(platformPda);
  if (existing) {
    console.log("Platform already initialized, skipping");
    return;
  }

  console.log("Initializing platform...");
  const tx = await program.methods
    .initializePlatform()
    .accounts({ authority: deployer.publicKey })
    .rpc();
  console.log(`Platform initialized: ${tx}`);
}

main().catch(console.error);
