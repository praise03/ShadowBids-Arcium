"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import * as anchor from "@coral-xyz/anchor";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import {
  getProgram,
  findResultPda,
  findUserStatsPda,
  PROGRAM_ID,
  type AuctionData,
  type AuctionResultData,
} from "./shadowbid";

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

  return { auction, result, loading };
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
  const { publicKey } = useWallet();
  const [pending, setPending] = useState(false);

  async function sha256Hash(...parts: (Uint8Array | string)[]): Promise<Uint8Array> {
    const encoder = new TextEncoder();
    const encoded = parts.map((p) => typeof p === "string" ? encoder.encode(p) : p);
    const totalLen = encoded.reduce((s, b) => s + b.byteLength, 0);
    const combined = new Uint8Array(totalLen);
    let offset = 0;
    for (const b of encoded) {
      combined.set(b, offset);
      offset += b.byteLength;
    }
    const hash = await crypto.subtle.digest("SHA-256", combined);
    return new Uint8Array(hash);
  }

  function placeholder32(v: number): number[] {
    const buf = new Uint8Array(32);
    const view = new DataView(buf.buffer);
    view.setUint32(28, v, true);
    buf[0] ^= 0x80;
    return Array.from(buf);
  }

  const submit = useCallback(
    async (args: { auction: PublicKey; amount: number }) => {
      if (!publicKey) throw new Error("Wallet not connected");
      setPending(true);
      try {
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const commitment = await sha256Hash(
          "shadowbid:v1",
          args.auction.toBytes(),
          publicKey.toBytes(),
          args.amount.toString(),
          salt,
        );

        const nonce = new anchor.BN(
          Array.from(crypto.getRandomValues(new Uint8Array(16))),
        );

        const tx = await program.methods
          .submitBidCommitment(
            Array.from(commitment),
            Array.from(crypto.getRandomValues(new Uint8Array(32))),
            nonce,
            placeholder32(args.amount),
            placeholder32(args.amount),
            placeholder32(args.amount),
            placeholder32(args.amount),
            placeholder32(1),
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
    [program, publicKey],
  );

  return { submit, pending };
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
