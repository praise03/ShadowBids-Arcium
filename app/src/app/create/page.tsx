"use client";

import { useCreateAuction } from "@/lib/hooks";
import { useWallet } from "@solana/wallet-adapter-react";
import { useState } from "react";

export default function CreatePage() {
  const wallet = useWallet();
  const { create, pending } = useCreateAuction();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [symbol, setSymbol] = useState("SOL");
  const [reserve, setReserve] = useState("100");
  const [increment, setIncrement] = useState("5");
  const [endTime, setEndTime] = useState("");
  const [txid, setTxid] = useState("");

  const handleCreate = async () => {
    if (!wallet.connected || !endTime) return;
    const now = Math.floor(Date.now() / 1000);
    try {
      const tx = await create({
        title,
        description,
        assetSymbol: symbol,
        reservePrice: parseInt(reserve, 10),
        minBidIncrement: parseInt(increment, 10),
        startTime: now - 10,
        endTime: Math.floor(new Date(endTime).getTime() / 1000),
        revealDeadline: Math.floor(new Date(endTime).getTime() / 1000) + 3600,
      });
      setTxid(tx);
    } catch (e) {
      console.error("Create failed", e);
    }
  };

  if (!wallet.connected) {
    return (
      <div className="max-w-3xl rounded-lg border border-white/10 bg-panel/85 p-6 shadow-glow">
        <h1 className="text-3xl font-black">Create auction</h1>
        <p className="mt-2 text-fog/60">Connect a wallet to create an auction.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl rounded-lg border border-white/10 bg-panel/85 p-6 shadow-glow">
      <h1 className="text-3xl font-black">Create auction</h1>
      <p className="mt-2 text-fog/60">Configure the public envelope. Bids remain sealed until Arcium finalization.</p>
      <div className="mt-6 grid gap-4">
        <Field label="Title" value={title} onChange={setTitle} />
        <Field label="Description" value={description} onChange={setDescription} />
        <Field label="Asset symbol" value={symbol} onChange={setSymbol} />
        <Field label="Reserve price" value={reserve} onChange={setReserve} type="number" />
        <Field label="Minimum increment" value={increment} onChange={setIncrement} type="number" />
        <label className="block">
          <span className="text-sm font-bold text-fog/70">End time</span>
          <input
            type="datetime-local"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="mt-2 w-full rounded-md border border-white/10 bg-ink px-3 py-3 text-white outline-none focus:border-brass"
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <button className="rounded-md border border-brass/40 bg-brass/10 px-4 py-3 font-bold text-brass">Mock settlement</button>
          <button className="rounded-md border border-white/10 px-4 py-3 font-bold text-fog/70">SPL scaffold</button>
        </div>
        <button
          onClick={handleCreate}
          disabled={pending || !title}
          className="rounded-md bg-brass px-4 py-3 font-black text-ink disabled:opacity-40"
        >
          {pending ? "Creating..." : "Create auction"}
        </button>
        {txid && (
          <p className="text-sm text-mint break-all">
            Created: {txid}
          </p>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-fog/70">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-md border border-white/10 bg-ink px-3 py-3 text-white outline-none focus:border-brass"
      />
    </label>
  );
}
