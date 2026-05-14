"use client";

import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";
import { clusterApiUrl } from "@solana/web3.js";
import { useMemo } from "react";
import "@solana/wallet-adapter-react-ui/styles.css";

function detectNetwork(): WalletAdapterNetwork {
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER;
  if (cluster === "localnet" || cluster === "devnet") return WalletAdapterNetwork.Devnet;
  if (cluster === "mainnet") return WalletAdapterNetwork.Mainnet;
  return WalletAdapterNetwork.Devnet;
}

export function WalletProviders({ children }: { children: React.ReactNode }) {
  const endpoint = process.env.NEXT_PUBLIC_RPC_URL ?? clusterApiUrl(WalletAdapterNetwork.Devnet);
  const network = detectNetwork();
  const wallets = useMemo(() => [new SolflareWalletAdapter({ network })], [network]);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
