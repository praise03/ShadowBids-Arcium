"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import * as anchor from "@coral-xyz/anchor";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import {
  getProgram,
  findResultPda,
  findSignPda,
  findUserStatsPda,
  PROGRAM_ID,
  type AuctionData,
  type AuctionResultData,
} from "./shadowbid";
import {
  buildBidCommitment,
  encryptBidForSubmission,
  getArciumProgram,
  getClockAccAddress,
  getClusterAccAddress,
  getCompDefAccAddress,
  getCompDefAccOffset,
  getComputationAccAddress,
  getExecutingPoolAccAddress,
  getFeePoolAccAddress,
  getMXEAccAddress,
  getMempoolAccAddress,
} from "./arcium";

const MAX_BIDS = 8;

function clusterOffsetToNumber(cluster: unknown): number {
  if (typeof cluster === "number") return cluster;
  if (typeof cluster === "bigint") return Number(cluster);
  if (
    cluster &&
    typeof cluster === "object" &&
    "toNumber" in cluster &&
    typeof (cluster as { toNumber: () => number }).toNumber === "function"
  ) {
    return (cluster as { toNumber: () => number }).toNumber();
  }
  throw new Error("Unable to determine the Arcium cluster offset for this MXE account.");
}

function padBidAccounts(bidAccounts: PublicKey[]): PublicKey[] {
  if (bidAccounts.length === 0) {
    throw new Error("At least one sealed bid is required before confidential compute can run.");
  }
  if (bidAccounts.length > MAX_BIDS) {
    throw new Error(`ShadowBid currently supports up to ${MAX_BIDS} bids per auction.`);
  }

  const padded = [...bidAccounts];
  while (padded.length < MAX_BIDS) {
    padded.push(padded[padded.length - 1]);
  }
  return padded;
}

function useProgram() {
  const { connection } = useConnection();
  const wallet = useWallet();
  return useMemo(() => {
    const provider = new anchor.AnchorProvider(
      connection,
      wallet as unknown as anchor.Wallet,
      { commitment: "confirmed" },
    );
    return getProgram(provider);
  }, [connection, wallet]);
}

export function useAuctions() {
  const program = useProgram();
  const [auctions, setAuctions] = useState<AuctionData[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const accounts = await program.account.auction.all();
      setAuctions(
        accounts.map((a) => ({
          ...a.account,
          pubkey: a.publicKey,
        })) as unknown as AuctionData[],
      );
    } catch {
      setAuctions([]);
    } finally {
      setLoading(false);
    }
  }, [program]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 15_000);
    return () => clearInterval(interval);
  }, [refresh]);

  return { auctions, loading, refresh };
}

export function useAuction(auctionPk: PublicKey | null) {
  const program = useProgram();
  const [auction, setAuction] = useState<AuctionData | null>(null);
  const [result, setResult] = useState<AuctionResultData | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!auctionPk) return;
    const pk = auctionPk;
    try {
      const [a, r] = await Promise.all([
        program.account.auction.fetch(pk),
        program.account.auctionResult
          .fetch(findResultPda(pk, PROGRAM_ID)[0])
          .catch(() => null),
      ]);
      setAuction({ ...a, pubkey: pk } as unknown as AuctionData);
      setResult(
        r ? ({ ...r, pubkey: findResultPda(pk, PROGRAM_ID)[0] } as unknown as AuctionResultData) : null,
      );
    } catch {
      setAuction(null);
    } finally {
      setLoading(false);
    }
  }, [auctionPk, program]);

  useEffect(() => {
    if (!auctionPk) return;
    let cancelled = false;

    async function fetch() {
      const pk = auctionPk;
      if (!pk) return;
      try {
        const [a, r] = await Promise.all([
          program.account.auction.fetch(pk),
          program.account.auctionResult
            .fetch(findResultPda(auctionPk, PROGRAM_ID)[0])
            .catch(() => null),
        ]);
        if (cancelled) return;
        setAuction({ ...a, pubkey: pk } as unknown as AuctionData);
        setResult(
          r ? ({ ...r, pubkey: findResultPda(pk, PROGRAM_ID)[0] } as unknown as AuctionResultData) : null,
        );
      } catch {
        if (!cancelled) setAuction(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetch();
    const interval = setInterval(fetch, 15_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [program, auctionPk]);

  return { auction, result, loading, refresh };
}

export function useCreateAuction() {
  const program = useProgram();
  const { publicKey } = useWallet();
  const [pending, setPending] = useState(false);

  const create = useCallback(
    async (args: {
      title: string;
      description: string;
      assetSymbol: string;
      reservePrice: number;
      minBidIncrement: number;
      startTime: number;
      endTime: number;
      revealDeadline: number;
    }) => {
      if (!publicKey) throw new Error("Wallet not connected");
      setPending(true);
      try {
        const auctionId = new anchor.BN(Date.now());

        const tx = await program.methods
          .createAuction(
            auctionId,
            args.title,
            args.description,
            args.assetSymbol,
            new anchor.BN(args.reservePrice),
            new anchor.BN(args.minBidIncrement),
            new anchor.BN(args.startTime),
            new anchor.BN(args.endTime),
            new anchor.BN(args.revealDeadline),
            { mock: {} },
          )
          .accounts({
            creator: publicKey,
          })
          .rpc();

        return tx;
      } finally {
        setPending(false);
      }
    },
    [program, publicKey],
  );

  return { create, pending };
}

export function useSubmitBid() {
  const program = useProgram();
  const wallet = useWallet();
  const { publicKey } = wallet;
  const [pending, setPending] = useState(false);

  const submit = useCallback(
    async (args: { auction: PublicKey; amount: number }) => {
      if (!publicKey) throw new Error("Wallet not connected");
      setPending(true);
      try {
        const amount = BigInt(args.amount);
        const commitment = await buildBidCommitment(
          args.auction,
          publicKey,
          amount,
        );
        const encryptedBid = await encryptBidForSubmission({
          wallet,
          programId: program.programId,
          bidder: publicKey,
          amount,
        });

        const tx = await program.methods
          .submitBidCommitment(
            commitment,
            encryptedBid.bidderX25519Pubkey,
            encryptedBid.nonce,
            encryptedBid.encryptedBidderLo,
            encryptedBid.encryptedBidderHi,
            encryptedBid.encryptedAmount,
            encryptedBid.encryptedSubmittedAt,
            encryptedBid.encryptedValid,
          )
          .accounts({
            bidder: publicKey,
            auction: args.auction,
          })
          .rpc();

        return tx;
      } finally {
        setPending(false);
      }
    },
    [program, publicKey, wallet],
  );

  return { submit, pending };
}

export function useCloseBidding() {
  const program = useProgram();
  const { publicKey } = useWallet();
  const [pending, setPending] = useState(false);

  const close = useCallback(async (auction: PublicKey) => {
    if (!publicKey) throw new Error("Wallet not connected");
    setPending(true);
    try {
      return await program.methods
        .closeBidding()
        .accounts({
          closer: publicKey,
          auction,
        })
        .rpc();
    } finally {
      setPending(false);
    }
  }, [program, publicKey]);

  return { close, pending };
}

export function useTriggerConfidentialCompute() {
  const program = useProgram();
  const { publicKey } = useWallet();
  const [pending, setPending] = useState(false);

  const trigger = useCallback(async (auction: PublicKey) => {
    if (!publicKey) throw new Error("Wallet not connected");

    setPending(true);
    try {
      const provider = program.provider as anchor.AnchorProvider;
      const arciumProgram = getArciumProgram(provider);
      const mxeAccountAddress = getMXEAccAddress(program.programId);
      const mxeAccount = await (arciumProgram.account as any).mxeAccount.fetch(
        mxeAccountAddress,
      );
      if (mxeAccount.cluster === null) {
        throw new Error("This MXE account is not assigned to an Arcium cluster yet.");
      }

      const clusterOffset = clusterOffsetToNumber(mxeAccount.cluster);
      const computationOffset = new anchor.BN(Date.now());
      const compDefOffset = getCompDefAccOffset("compute_winner");
      const [result] = findResultPda(auction, program.programId);
      const [signPda] = findSignPda(program.programId);
      const allBidAccounts = await program.account.bidCommitment.all();
      const bidAccounts = allBidAccounts
        .filter((account) => account.account.auction.equals(auction))
        .map((account) => account.publicKey);
      const paddedBidAccounts = padBidAccounts(bidAccounts);

      return await program.methods
        .triggerConfidentialCompute(computationOffset)
        .accountsPartial({
          payer: publicKey,
          signPdaAccount: signPda,
          auction,
          result,
          mxeAccount: mxeAccountAddress,
          mempoolAccount: getMempoolAccAddress(clusterOffset),
          executingPool: getExecutingPoolAccAddress(clusterOffset),
          computationAccount: getComputationAccAddress(
            clusterOffset,
            computationOffset,
          ),
          compDefAccount: getCompDefAccAddress(program.programId, compDefOffset),
          clusterAccount: getClusterAccAddress(clusterOffset),
          poolAccount: getFeePoolAccAddress(),
          clockAccount: getClockAccAddress(),
          arciumProgram: arciumProgram.programId,
        })
        .remainingAccounts(
          paddedBidAccounts.map((pubkey) => ({
            pubkey,
            isWritable: false,
            isSigner: false,
          })),
        )
        .rpc({ skipPreflight: true, commitment: "confirmed" });
    } finally {
      setPending(false);
    }
  }, [program, publicKey]);

  return { trigger, pending };
}

export function useMarkSettlementCompleted() {
  const program = useProgram();
  const { publicKey } = useWallet();
  const [pending, setPending] = useState(false);

  const markSettled = useCallback(async (auction: PublicKey) => {
    if (!publicKey) throw new Error("Wallet not connected");
    setPending(true);
    try {
      return await program.methods
        .markSettlementCompleted()
        .accounts({
          creator: publicKey,
          auction,
        })
        .rpc();
    } finally {
      setPending(false);
    }
  }, [program, publicKey]);

  return { markSettled, pending };
}

export function useUserStats() {
  const program = useProgram();
  const { publicKey } = useWallet();
  const [stats, setStats] = useState<{
    auctionsCreated: number;
    bidsPlaced: number;
    wins: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!publicKey) {
      setStats(null);
      setLoading(false);
      return;
    }
    let cancelled = false;

    async function fetch() {
      const pk = publicKey;
      if (!pk) return;
      try {
        const [pda] = findUserStatsPda(pk, program.programId);
        const s = await program.account.userStats.fetch(pda);
        if (!cancelled) {
          setStats({
            auctionsCreated: (s as { auctionsCreated: number }).auctionsCreated,
            bidsPlaced: (s as { bidsPlaced: number }).bidsPlaced,
            wins: (s as { wins: number }).wins,
          });
        }
      } catch {
        if (!cancelled) setStats(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetch();
    return () => { cancelled = true; };
  }, [program, publicKey]);

  return { stats, loading };
}

export function useLeaderboard() {
  const program = useProgram();
  const [rows, setRows] = useState<Array<{
    owner: PublicKey;
    auctionsCreated: number;
    bidsPlaced: number;
    wins: number;
  }>>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const accounts = await program.account.userStats.all();
      setRows(
        accounts
          .map((account) => ({
            owner: account.account.owner as PublicKey,
            auctionsCreated: account.account.auctionsCreated as number,
            bidsPlaced: account.account.bidsPlaced as number,
            wins: account.account.wins as number,
          }))
          .sort((left, right) => {
            if (right.wins !== left.wins) return right.wins - left.wins;
            if (right.auctionsCreated !== left.auctionsCreated) {
              return right.auctionsCreated - left.auctionsCreated;
            }
            return right.bidsPlaced - left.bidsPlaced;
          }),
      );
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [program]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { rows, loading, refresh };
}
