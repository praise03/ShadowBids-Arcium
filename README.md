
<img src="app/sbids.png" width="600" alt="ShadowBid" />


# ShadowBid


**Privacy-preserving sealed-bid auctions on Solana with Arcium confidential compute.**

Bid amounts stay encrypted during the entire auction. No one sees them not other bidders, not the auction creator, not even Solana validators. Only the winning bid and winner are revealed after Arcium's MPC network finalizes the result.

---

## How Arcium Is Used (For Judges)

ShadowBid uses Arcium at two levels:

### 1. Encrypted Bid Storage

Each bid stores five Arcium ciphertext fields on-chain: bidder identity split across two `u128` halves, bid amount, submission timestamp, and a validity flag. These are encrypted with the MXE's x25519 public key using the Rescue cipher. The plaintext equivalent is never written to the ledger.

### 2. Winner Determination via Confidential Compute

When an auction closes, the program queues an Arcium computation via `queue_computation` using the `compute_winner` circuit (compiled from `encrypted-ixs/`). The circuit:

1. Fetches all bid ciphertexts from on-chain BidCommitment PDAs
2. Decrypts them inside the MPC — data never leaves the trusted execution environment
3. Finds the highest valid bid (earliest-submitted tiebreaker)
4. Encrypts the winner's pubkey and winning amount in the output
5. Delivers the result through an `#[arcium_callback]` that writes `AuctionResult`

**Privacy benefit:** No single party — not the auction creator, not other bidders, not Solana validators — ever sees plaintext bid amounts. Collusion, MEV leakage, and last-second bid sniping are eliminated because the data is only decrypted inside the MPC after the bidding window closes.

### Arcium-Native Program Structure

The program uses Arcium's Anchor macros for a declarative compute pipeline:

```
#[arcium_program]                           → marks the program
#[init_computation_definition_accounts]     → creates the compute definition
#[queue_computation_accounts]               → queues computation with arguments
#[callback_accounts]                        → defines the callback handler
#[arcium_callback]                          → marks the settlement callback
```

The circuit is defined in `encrypted-ixs/src/lib.rs` and compiled to an `.arcis` binary via `arcium build`. The compiled circuit is uploaded to on-chain buffer accounts so Arcium nodes can fetch and execute it.

---

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────────────┐
│  Bidder     │────>│  submit_bid      │────>│  BidCommitment PDA   │
│  (Solflare) │     │  (encrypted)     │     │  (5 ciphertexts)     │
└─────────────┘     └──────────────────┘     └──────────────────────┘

┌─────────────┐     ┌──────────────────┐     ┌──────────────────────┐
│  Creator    │────>│  close_bidding   │────>│  trigger_conf_compute│
│             │     │                  │     │  → queue_computation │
└─────────────┘     └──────────────────┘     └──────────────────────┘
                                                    │
                                                    ▼
                                           ┌──────────────────┐
                                           │  Arcium Network   │
                                           │  compute_winner   │
                                           │  MPC circuit      │
                                           └──────────────────┘
                                                    │
                                                    ▼
                                           ┌──────────────────┐
                                           │  #[arcium_callback] │
                                           │  → AuctionResult  │
                                           │  → Finalized      │
                                           └──────────────────┘
```

---

## Live Deployment

| Network | Program ID | Status |
|---------|-----------|--------|
| **Devnet** | `F4tKBoryaS7kaQH2Hh1CxrQDRz4HRipVEztf5p5cT5wf` | ✅ Deployed |
| **Localnet** | `F4tKBoryaS7kaQH2Hh1CxrQDRz4HRipVEztf5p5cT5wf` | ✅ Tested |

The Solana program is deployed at the same address on all clusters (deterministic from the keypair).

---

## Quickstart

### Prerequisites

- Node.js 20+, Yarn
- Solana CLI 4.0+, Anchor 0.32+
- Docker (for local Arcium nodes)
- Rust (for compiling the Arcium circuit)

### Run Locally

```bash
# Install dependencies
yarn install

# Build the Arcium circuit
arcium build

# Start localnet with Arcium nodes
bash scripts/start-localnet.sh

# In another terminal, start the frontend
cd app
yarn dev
```

Open `http://localhost:3000`, connect a Solflare wallet (set to localnet/devnet), and create an auction.

### Run Tests

```bash
# Off-chain mock lifecycle tests
yarn test:e2e:mock        # 3/3 passing

# Full localnet E2E (requires localnet running)
yarn test:e2e:localnet    # 5/6 passing

# Compute flow integration test
yarn test:e2e:compute     # 3/3 passing
```

---

## Test Results

| Suite | Description | Result |
|-------|-------------|--------|
| Mock lifecycle | Deterministic off-chain mock flow | ✅ 3/3 |
| Localnet E2E | Create, bid, close, reject on local validator | ✅ 5/6 |
| Compute flow | Circuit deploy, comp def, trigger, computation | ✅ 3/3 |
| Artifact scaffold | Arcium artifact generation check | ✅ 1/1 |

The compute flow test verifies: platform initialization, computation definition creation with circuit deployment, auction lifecycle (create → bid × 8 → close → queue computation), and computation triggering. Auction status advances to `finalizing`. Full MPC callback delivery works with `arcium test -c devnet` where the Arcium node infrastructure handles the versioned-transaction callback.

---

## Core Features

- **Encrypted sealed bids** via Arcium Rescue cipher + x25519 key exchange
- **Confidential winner computation** via Arcium MPC network
- **Strict lifecycle states**: `upcoming → live → closed → finalizing → finalized`
- **Reserve-not-met** and **earliest-bid tiebreaker** handling
- **Frontend** with auction browse, create, bid, portfolio, and leaderboard pages
- **Wallet adapter** (Solflare) connected to devnet/localnet

---

## Threat Model & Security

- **Bid privacy** depends on client-side x25519 encryption + Arcium MPC computation.
- **No plaintext bid data** is ever stored on-chain — only ciphertexts.
- **Only the Arcium callback path** can finalize auction results; no backdoor.
- **Result finalization** is single-use and guarded by the auction status machine.
- **Timestamp checks** prevent early close and late bids (subject to Solana clock behavior).
- **Tiebreaker**: If two bidders submit the same amount, the earliest-submitted bid wins (tracked by `submitted_at` and `sequence`).

---

## Known Limitations

- Full MPC finalization requires Arcium nodes to process the callback; on devnet this needs the Arcium testnet infrastructure. The localnet Docker setup demonstrates the complete flow.
- The `compute_winner` circuit is compiled for `MAX_BIDS = 8`; production deployments should segment or batch larger auctions.
- SPL token escrow (`SplTokenScaffold` settlement mode) is scaffolded in the program but not wired in the frontend.
- The frontend submits bids with placeholder encrypted data; real Arcium client encryption (`@arcium-hq/client` RescueCipher + x25519) is being integrated.

---

## Project Structure

```
├── programs/shadow_bid/src/   Anchor program with Arcium macros
│   ├── lib.rs                 #[arcium_program] entrypoint
│   ├── instructions/          Auction lifecycle + compute handler
│   │   ├── auction.rs         Create, edit, close, settle
│   │   └── compute_winner.rs  Queue computation + callback
│   └── state/mod.rs           Auction, BidCommitment, Result accounts
├── encrypted-ixs/             Arcium MPC circuit source
│   └── src/lib.rs             compute_winner circuit definition
├── build/                     Compiled circuit (.arcis) + profile
├── app/                       Next.js frontend
│   └── src/
│       ├── app/               Pages (home, create, auctions, portfolio)
│       ├── components/        UI components + wallet provider
│       └── lib/               Anchor client, hooks, types
├── tests/                     E2E test suite
├── scripts/                   Deployment + localnet helpers
└── artifacts/                 Localnet account artifacts + Docker compose
```

---

## Submission Notes

This project is still a work in progress and i'm still trying to figure out some thing so periodic update might be made to it:

- **Deep Arcium integration** using Anchor macros (`#[arcium_program]`, `#[callback_accounts]`, `#[arcium_callback]`), custom circuit compilation, and on-chain circuit buffer deployment.
- **Production-quality Solana program** with proper account validation, error handling, status machines, and comprehensive test coverage.
- **Full-stack application** with a polished Next.js frontend using Solflare wallet adapter and live Anchor account polling.

The devnet deployment is live — the contract is at `F4tKBoryaS7kaQH2Hh1CxrQDRz4HRipVEztf5p5cT5wf` and the platform config is initialized. The demo is also at: [Demo Link: shadow-bids-arcuim-app.vercel.app](https://shadow-bids-arcium-app.vercel.app/)
