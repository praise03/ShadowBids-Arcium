#!/usr/bin/env bash
set -euo pipefail

echo "=== Deploying ShadowBid to devnet ==="
solana config set --url https://api.devnet.solana.com

echo "Checking balance..."
BAL=$(solana balance)
echo "Balance: $BAL"

echo "Building program..."
anchor build

echo "Deploying program (with priority fee to avoid rate limits)..."
solana program deploy \
  --use-rpc \
  --with-compute-unit-price 10000 \
  --program-id target/deploy/shadow_bid-keypair.json \
  target/deploy/shadow_bid.so

echo "Initializing platform..."
npx tsx scripts/init-devnet.ts

echo ""
echo "=== Deployment complete ==="
echo "Program ID: F4tKBoryaS7kaQH2Hh1CxrQDRz4HRipVEztf5p5cT5wf"
echo "Balance remaining: $(solana balance)"
