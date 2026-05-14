#!/usr/bin/env bash
set -euo pipefail

echo "ShadowBid devnet checklist"
echo "1. solana config set --url devnet"
echo "2. solana airdrop 2"
echo "3. anchor build"
echo "4. anchor deploy --provider.cluster devnet"
echo "5. npm --workspace app run dev"
