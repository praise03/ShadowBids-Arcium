import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const IDL = JSON.parse(readFileSync(join(process.cwd(), "node_modules/@arcium-hq/client/src/idl/arcium.json"), "utf-8"));
const SB = new PublicKey("F4tKBoryaS7kaQH2Hh1CxrQDRz4HRipVEztf5p5cT5wf");
const ARCIUM = new PublicKey("Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ");
const LUT_PROG = new PublicKey("AddressLookupTab1e1111111111111111111111111");
const BPF = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
const SYS = new PublicKey("11111111111111111111111111111111");
const CLUSTER = 456;

function pda(seeds: Buffer[], prog: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(seeds, prog)[0];
}

async function main() {
  const conn = new Connection("https://api.devnet.solana.com", "confirmed");
  const payer = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(readFileSync(homedir() + "/.config/solana/id.json", "utf-8"))),
  );
  const prov = new anchor.AnchorProvider(conn, new anchor.Wallet(payer), { commitment: "confirmed" });
  anchor.setProvider(prov);
  const prog = new anchor.Program(IDL as anchor.Idl, prov);

  const clBuf = Buffer.alloc(4); clBuf.writeUInt32LE(CLUSTER, 0);
  const [mxePda] = PublicKey.findProgramAddressSync([Buffer.from("MXEAccount"), SB.toBuffer()], ARCIUM);
  const [clusterAcc] = PublicKey.findProgramAddressSync([Buffer.from("Cluster"), clBuf], ARCIUM);
  const [recoveryAcc] = PublicKey.findProgramAddressSync([Buffer.from("RecoveryClusterAccount"), SB.toBuffer()], ARCIUM);

  // Recent slot for LUT
  const recentSlot = await conn.getSlot();
  console.log("Recent slot:", recentSlot);
  const slotBuf = new anchor.BN(recentSlot).toArrayLike(Buffer, "le", 8);

  // LUT address: derived from MXE PDA + recent_slot as lut_offset_slot
  const [lutAddr] = PublicKey.findProgramAddressSync([mxePda.toBuffer(), slotBuf], LUT_PROG);
  console.log("LUT addr:", lutAddr.toBase58());

  const [mempool] = PublicKey.findProgramAddressSync([Buffer.from("Mempool"), clBuf], ARCIUM);
  const [execpool] = PublicKey.findProgramAddressSync([Buffer.from("Execpool"), clBuf], ARCIUM);
  const [feePool] = PublicKey.findProgramAddressSync([Buffer.from("FeePool")], ARCIUM);
  const [clock] = PublicKey.findProgramAddressSync([Buffer.from("ClockAccount")], ARCIUM);
  const [progData] = PublicKey.findProgramAddressSync([SB.toBuffer()], BPF);

  const keygenOff = new anchor.BN(100);
  const keyRecOff = new anchor.BN(200);
  const [keygenCompDef] = PublicKey.findProgramAddressSync(
    [Buffer.from("ComputationDefinitionAccount"), SB.toBuffer(), Buffer.from([1, 0, 0, 0])], ARCIUM);
  const [keygenComp] = PublicKey.findProgramAddressSync(
    [Buffer.from("ComputationAccount"), clBuf, keygenOff.toArrayLike(Buffer, "le", 8)], ARCIUM);
  const [keyRecComp] = PublicKey.findProgramAddressSync(
    [Buffer.from("ComputationAccount"), clBuf, keyRecOff.toArrayLike(Buffer, "le", 8)], ARCIUM);

  // Check existing state
  if (await conn.getAccountInfo(mxePda)) {
    console.log("MXE already exists");
    return;
  }

  // Part 1
  if (!await conn.getAccountInfo(recoveryAcc)) {
    console.log("Part 1...");
    await prog.methods.initMxePart1()
      .accounts({ signer: payer.publicKey, mxeProgram: SB, systemProgram: SYS })
      .rpc().then(t => console.log("  tx:", t));
  } else {
    console.log("Recovery acc exists");
  }

  // Part 2 - everything explicit
  console.log("Part 2 with recent_slot=" + recentSlot + "...");
  const peers = new Array(100).fill(0);
  const tx = await prog.methods.initMxePart2(
    CLUSTER, SB, peers, keygenOff, keyRecOff, new anchor.BN(recentSlot),
  )
  .accounts({
    signer: payer.publicKey,
    cluster: clusterAcc,
    mxe: mxePda,
    recoveryClusterAcc: recoveryAcc,
    executingPool: execpool,
    mempool: mempool,
    mxeKeygenComputationDefinition: keygenCompDef,
    mxeKeygenComputation: keygenComp,
    keyRecoveryInitComputation: keyRecComp,
    mxeAuthority: payer.publicKey,
    mxeProgram: SB,
    programData: progData,
    poolAccount: feePool,
    addressLookupTable: lutAddr,
    lutProgram: LUT_PROG,
    clock: clock,
    systemProgram: SYS,
  })
  .rpc();
  console.log("Part 2:", tx);
  console.log("MXE:", mxePda.toBase58());
}

main().catch(console.error);
