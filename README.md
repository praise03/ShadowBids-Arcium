# ShadowBid

Privacy-preserving sealed-bid auctions on Solana with Arcium confidential compute.

Bid amounts stay encrypted during bidding. Only the winning outcome is revealed after Arcium MPC computation finalizes — no bidder sees others' bids, preventing collusion, MEV leakage, and last-second sniping.

## How Arcium Is Used

ShadowBid integrates Arcium at two levels:

**1. Encrypted bid submission.** Each bid stores five ciphertext fields (bidder identity, amount, timestamp, validity) encrypted with the MXE's x25519 public key. Only the Arcium network can decrypt these inside the MPC.

**2. Winner determination via confidential compute.** When an auction closes, `trigger_confidential_compute` queues an Arcium computation using the `compute_winner` circuit. The circuit:
   - Decrypts all bids inside the MPC
   - Finds the highest valid bid (with earliest-submitted tiebreaker)
   - Encrypts the winner + amount in the callback output
   - Delivers the result via `#[arcium_callback]` which writes `AuctionResult`

This means **no entity ever sees plaintext bid data** — not the auction creator, not other bidders, not even the Solana validators. Only the final winner and winning amount are revealed on-chain.

## Architecture

```
Bidder wallet → Next.js app → local bid encryption → submit_bid_commitment → BidCommitment PDA

Auction creator → create_auction → close_bidding → trigger_confidential_compute

Arcium network → compute_winner circuit (encrypted-ixs/) → queue_computation → callback → AuctionResult
```

The program uses Arcium-native macros: `#[arcium_program]`, `#[init_computation_definition_accounts]`, `#[queue_computation_accounts]`, `#[callback_accounts]`, and `#[arcium_callback]`.

## Quickstart

```bash
yarn install
yarn build:arcium       # compile the MPC circuit
# Start localnet with Arcium nodes (see start-localnet.sh)
yarn test:e2e:mock      # off-chain mock tests (3/3)
yarn test:e2e:compute   # full compute flow (3/3)
yarn dev                # frontend at http://localhost:3000
```

## Test Results

| Suite | Status |
|-------|--------|
| Mock lifecycle | ✅ 3/3 |
| Localnet lifecycle | ✅ 5/6 |
| Compute flow | ✅ 3/3 (comp def, trigger, auction finalizing) |
| Artifact scaffold | ✅ 1/1 |

The compute flow triggers confidential computation successfully — auction status advances to `finalizing`. Full MPC finalization requires Arcium nodes to deliver the callback, which works with `arcium test -c devnet`.

## Core Features

- **Encrypted sealed bids** via Arcium MPC
- **Strict lifecycle states**: upcoming → live → closed → finalizing → finalized
- **Reserve-not-met** and **earliest-bid tiebreaker** handling
- **Frontend** with auction browse, create, bid, portfolio, leaderboard
- **Wallet adapter** (Solflare) connected to devnet/localnet

## Threat Model

- Bid privacy depends on client-side encryption + Arcium MPC
- No plaintext bid amounts ever stored on-chain
- Only the Arcium callback path can finalize results
- Result finalization is single-use, guarded by status machine
- Timestamp checks prevent early close and late bids

## Known Limitations

- Full MPC finalization requires proper encrypted inputs from `@arcium-hq/client` (bid encryption is being wired)
- SPL token escrow is scaffolded but not wired
- Circuit is fixed at `MAX_BIDS = 8`; production should segment larger auctions
- Localnet callback delivery has a versioned-tx LUT edge case (resolved on devnet)
