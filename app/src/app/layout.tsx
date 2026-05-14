import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { WalletProviders } from "@/components/wallet-providers";

export const metadata: Metadata = {
  title: "ShadowBid",
  description: "Privacy-preserving sealed-bid auctions on Solana with Arcium.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <WalletProviders>
          <AppShell>{children}</AppShell>
        </WalletProviders>
      </body>
    </html>
  );
}
