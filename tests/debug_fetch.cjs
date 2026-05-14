const anchor = require("@coral-xyz/anchor");
const { Keypair, PublicKey, Connection } = require("@solana/web3.js");
const fs = require("fs");
const path = require("path");

const PROGRAM_ID = new PublicKey("8puBXz8VZeBhb33UQjztq5qWpnLApW2tyUX4ijCubPWx");

async function main() {
  // Recreate what the test does exactly
  const connection = new Connection("http://127.0.0.1:8899");
  const deployer = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(require("os").homedir() + "/.config/solana/id.json", "utf-8"))),
  );
  const wallet = new anchor.Wallet(deployer);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);

  const idl = JSON.parse(fs.readFileSync(path.join(__dirname, "../app/src/idl/shadow_bid.json"), "utf-8"));
  const program = new anchor.Program(idl, provider);

  const pk = new PublicKey("8puBXz8VZeBhb33UQjztq5qWpnLApW2tyUX4ijCubPWx");
  const [platformPda] = PublicKey.findProgramAddressSync([Buffer.from("platform")], pk);
  console.log("Platform PDA:", platformPda.toBase58());
  console.log("Program ID:", program.programId.toBase58());

  // Check BEFORE
  const before = await connection.getAccountInfo(platformPda);
  console.log("Before rpc:", before ? "EXISTS" : "null");

  // Call init
  const sig = await program.methods
    .initializePlatform()
    .accounts({ authority: wallet.publicKey })
    .rpc();
  console.log("RPC sig:", sig);

  // immediate check
  const imm = await connection.getAccountInfo(platformPda);
  console.log("Immediate after rpc:", imm ? `EXISTS (${imm.data.length}B)` : "null");

  // wait a bit
  await new Promise(r => setTimeout(r, 2000));
  const after = await connection.getAccountInfo(platformPda);
  console.log("2s after:", after ? `EXISTS (${after.data.length}B)` : "null");

  // Try fetch via program
  try {
    const config = await program.account.platformConfig.fetch(platformPda);
    console.log("Fetch succeeded! authority:", config.authority.toBase58());
  } catch (e) {
    console.log("Fetch failed:", e.message);
  }

  // Try raw getAccountInfo with different commitments
  for (const c of ["processed", "confirmed", "finalized"]) {
    const info = await connection.getAccountInfo(platformPda, c);
    console.log(`  getAccountInfo("${c}"):`, info ? `EXISTS ${info.data.length}B` : "null");
  }

  // Try getAccountInfoAndContext
  for (const c of ["processed", "confirmed", "finalized", undefined]) {
    const { value } = await connection.getAccountInfoAndContext(platformPda, c);
    console.log(`  getAccountInfoAndContext(${c}):`, value ? `EXISTS ${value.data.length}B` : "null");
  }
}

main().catch(console.error);
