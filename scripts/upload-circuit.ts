import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey, Keypair, Transaction } from "@solana/web3.js";
import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { createHash } from "crypto";
function getCompDefOffset(name: string): Buffer {
  return createHash("sha256").update(name).digest().subarray(0, 4);
}

const ARCIUM = new PublicKey("Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ");
const SB = new PublicKey("F4tKBoryaS7kaQH2Hh1CxrQDRz4HRipVEztf5p5cT5wf");
const MAX_UPLOAD = 814;
const MAX_REALLOC = 10240;
const MAX_EMBIGGEN = 18;

// Load and patch IDL with devnet format
const IDL = JSON.parse(readFileSync(join(process.cwd(), "node_modules/@arcium-hq/client/src/idl/arcium.json"), "utf-8"));
for (const ix of IDL.instructions) {
  if (ix.name === "init_computation_definition" && ix.args.length < 6) {
    ix.args.push({ name: "finalization_authority", type: { option: "pubkey" } });
  }
}

async function main() {
  const conn = new Connection("https://api.devnet.solana.com", "confirmed");
  const payer = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(readFileSync(homedir() + "/.config/solana/id.json", "utf-8"))),
  );
  const prov = new anchor.AnchorProvider(conn, new anchor.Wallet(payer), { commitment: "confirmed" });
  anchor.setProvider(prov);
  const prog = new anchor.Program(IDL as anchor.Idl, prov);

  const offsetBuf = getCompDefOffset("compute_winner");
  const offset = offsetBuf.readUInt32LE(0);

  const [compDefPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("ComputationDefinitionAccount"), SB.toBuffer(), offsetBuf],
    ARCIUM,
  );

  const data = readFileSync(join(process.cwd(), "build/compute_winner.arcis"));
  console.log("Circuit:", data.length, "bytes");

  const [rawPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("ComputationDefinitionRaw"), compDefPda.toBuffer(), Buffer.from([0])],
    ARCIUM,
  );

  const existing = await conn.getAccountInfo(rawPda);
  const requiredSize = data.length + 9;

  if (existing && existing.data.length >= requiredSize) {
    console.log("Raw circuit already exists with sufficient size");
  } else {
    if (!existing) {
      console.log("Initializing raw circuit account...");
      const tx = await prog.methods.initRawCircuitAcc(offset, SB, 0)
        .accounts({ signer: payer.publicKey }).rpc();
      console.log("  Init:", tx);
    }

    if (data.length > MAX_REALLOC) {
      const totalResize = data.length;
      console.log(`Resizing to ${totalResize} bytes...`);
      let currentSize = (await conn.getAccountInfo(rawPda))?.data.length || 9;
      let resizeNum = 0;
      while (currentSize < totalResize) {
        // Check signer balance first
        const bal = await conn.getBalance(payer.publicKey);
        if (bal < 5000000) { // < 0.005 SOL
          console.log(`  Low balance (${bal} lamports), funding from circuit account...`);
          // Transfer from raw circuit back to signer
          break;
        }
        const tx = new Transaction();
        tx.add(await prog.methods.embiggenRawCircuitAcc(offset, SB, 0)
          .accounts({ signer: payer.publicKey }).instruction());
        currentSize += MAX_REALLOC;
        try {
          const sig = await prov.sendAndConfirm(tx, [payer]);
          if (++resizeNum % 30 === 0) console.log(`  Resize ${resizeNum}: ${Math.min(currentSize, totalResize)}/${totalResize} bytes`);
        } catch {
          console.log(`  Resize ${resizeNum+1} failed, trying single...`);
          const tx2 = new Transaction();
          tx2.add(await prog.methods.embiggenRawCircuitAcc(offset, SB, 0)
            .accounts({ signer: payer.publicKey }).instruction());
          await prov.sendAndConfirm(tx2, [payer]);
          resizeNum++;
          currentSize += MAX_REALLOC;
        }
      }
      console.log(`  Resize done: ${resizeNum} txs, current: ${currentSize}/${totalResize} bytes`);
    }

    const totalChunks = Math.ceil(data.length / MAX_UPLOAD);
    console.log(`Uploading ${totalChunks} chunks...`);
    const bh = await conn.getLatestBlockhash();
    for (let i = 0; i < totalChunks; i += 50) {
      const batch = [];
      for (let j = i; j < Math.min(i + 50, totalChunks); j++) {
        const offsetBytes = j * MAX_UPLOAD;
        const chunk = data.subarray(offsetBytes, offsetBytes + MAX_UPLOAD);
        const padded = Buffer.alloc(MAX_UPLOAD);
        padded.set(chunk);
        const tx = await prog.methods.uploadCircuit(offset, SB, 0, Array.from(padded), offsetBytes)
          .accounts({ signer: payer.publicKey }).transaction();
        tx.recentBlockhash = bh.blockhash;
        tx.feePayer = payer.publicKey;
        tx.sign(payer);
        batch.push(conn.sendRawTransaction(tx.serialize({ requireAllSignatures: false })));
      }
      const sigs = await Promise.all(batch);
      console.log(`  Batch ${Math.floor(i/50)+1}: ${sigs.filter(Boolean).length} txs`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  // Finalize
  console.log("Finalizing...");
  const sig = await prog.methods.finalizeComputationDefinition(offset, SB)
    .accounts({ signer: payer.publicKey }).rpc();
  console.log("Circuit deployed! Finalize:", sig);
}

main().catch(console.error);
