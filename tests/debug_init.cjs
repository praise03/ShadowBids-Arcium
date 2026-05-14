const anchor = require("@coral-xyz/anchor");
const { Keypair, PublicKey, Connection, SystemProgram, Transaction, TransactionInstruction } = require("@solana/web3.js");
const fs = require("fs");
const path = require("path");

const PROGRAM_ID = new PublicKey("8puBXz8VZeBhb33UQjztq5qWpnLApW2tyUX4ijCubPWx");
const connection = new Connection("http://127.0.0.1:8899", "confirmed");
const deployer = Keypair.fromSecretKey(
  Buffer.from(JSON.parse(fs.readFileSync(require("os").homedir() + "/.config/solana/id.json", "utf-8"))),
);

async function main() {
  const [platformPda] = PublicKey.findProgramAddressSync([Buffer.from("platform")], PROGRAM_ID);
  console.log("Platform PDA:", platformPda.toBase58());

  const before = await connection.getAccountInfo(platformPda);
  console.log("Before:", before ? `exists ${before.data.length}B` : "null");

  // Manually build InitializePlatform instruction
  // discriminator: sha256("global:initialize_platform")[..8]
  const discriminator = Buffer.from([119, 201, 101, 45, 75, 122, 89, 3]);
  
  const keys = [
    { pubkey: deployer.publicKey, isSigner: true, isWritable: true },
    { pubkey: platformPda, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  const ix = new TransactionInstruction({ programId: PROGRAM_ID, keys, data: discriminator });
  const tx = new Transaction().add(ix);
  
  const sig = await anchor.web3.sendAndConfirmTransaction(connection, tx, [deployer], { commitment: "confirmed" });
  console.log("TX:", sig);

  const after = await connection.getAccountInfo(platformPda);
  console.log("After:", after ? `exists ${after.data.length}B` : "STILL NULL");

  // Also test with Anchor
  console.log("\n--- Now trying with Anchor Program class ---");
  const wallet = new anchor.Wallet(deployer);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);

  const idl = JSON.parse(fs.readFileSync(path.join(__dirname, "../app/src/idl/shadow_bid.json"), "utf-8"));
  const program = new anchor.Program(idl, provider);
  
  const [pda2] = PublicKey.findProgramAddressSync([Buffer.from("platform")], PROGRAM_ID);
  console.log("PDA (Anchor method):", pda2.toBase58());
  
  // Try calling via Anchor methods
  try {
    const sig2 = await program.methods.initializePlatform().accounts({ authority: wallet.publicKey }).rpc();
    console.log("Anchor TX:", sig2);
  } catch (e) {
    console.log("Anchor error:", e.message);
    if (e.logs) console.log("Logs:", e.logs.join("\n"));
  }

  const after2 = await connection.getAccountInfo(platformPda);
  console.log("After Anchor:", after2 ? `exists ${after2.data.length}B` : "STILL NULL");
}

main().catch(console.error);
