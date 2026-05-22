# ShadowBid Developer Walkthrough

This walkthrough gets a new developer from zero to a running ShadowBid project.

## Prerequisites

- Node.js 20+ (`node --version`)
- Yarn 1.x (`yarn --version`)
- Rust/Cargo (`cargo --version`)
- Solana CLI 2.x (`solana --version`)
- Anchor CLI 0.32.1 (`anchor --version`)
- Docker Desktop for real Arcium localnet
- Arcium CLI for real confidential compute (`curl -sSfL https://install.arcium.com/ | bash`)

## Environment

```bash
cp .env.example .env
cp app/.env.example app/.env.local
yarn install
solana config set --url localhost
solana-keygen new --no-bip39-passphrase --force
```

Expected output: workspace dependencies install, and Solana CLI points at localhost.

## Local Validator

Run a validator in a separate terminal:

```bash
solana-test-validator
```

Expected output: the validator prints an RPC URL at `http://127.0.0.1:8899`.

## Program Build

```bash
yarn build:circuit
anchor build
```

Expected output: `yarn build:circuit` regenerates the canonical root `build/` artifacts from `encrypted-ixs/src/lib.rs`, and `anchor build` compiles the native `shadow_bid` program.

## Program Tests

```bash
yarn test:e2e
yarn test:e2e:mock
```

Expected output: the artifact-level native-path scaffold passes, and the deterministic mock flow passes.

If you have a validator and Arcium localnet running, use the real suites:

```bash
yarn test:e2e:localnet
yarn test:e2e:compute
```

Expected output: localnet and compute tests submit real encrypted bid payloads and exercise the on-chain Arcium path.

## Real Arcium Path

The real confidential compute path now lives in:

- `encrypted-ixs/src/lib.rs`
- `programs/shadow_bid/src/lib.rs`
- `programs/shadow_bid/src/instructions/compute_winner.rs`

Key native pieces to look for:
- `#[arcium_program]`
- `init_compute_winner_comp_def`
- `queue_computation(...)`
- `#[arcium_callback(encrypted_ix = "compute_winner")]`
- `output.verify_output(...)`

Current real-path coverage already includes:
- MXE public key fetching with retry
- x25519 key agreement
- `RescueCipher` encryption with fresh nonces
- matching `ArgBuilder` ordering for every `Enc<Shared, ...>` parameter

The main remaining limitation is operational: Arcium nodes/local validator/devnet funding must be available for the full callback loop to complete.

## Frontend

```bash
yarn dev
```

Expected output: Next.js starts at `http://localhost:3000`.

Open the app, connect Solflare on devnet, and walk through:

1. `/` shows the auction desk.
2. `/auctions` shows filters and auction cards.
3. `/auctions/<auction-pubkey>` shows bid, lifecycle, privacy, close, compute-trigger, and result panels.
4. `/create` shows the creator flow.
5. `/portfolio` and `/leaderboard` show reputation-lite state.

## Common Fixes

- `arcium: command not found`: install Arcium CLI and restart your shell.
- `Account not initialized`: run `initialize_platform` before auction instructions.
- `AuctionStillLive`: wait until `end_time` or create a shorter test auction.
- `No validator on 127.0.0.1:8899`: start `solana-test-validator` or `bash scripts/start-localnet.sh`.
- `MXE public key unavailable`: wait for the local Arcium nodes to finish booting, then retry.
- `Auction has fewer than 8 bids`: the UI pads remaining bid slots during compute queueing, but production code should replace this with explicit invalid-bid padding.
- Frontend wallet modal missing styles: confirm `@solana/wallet-adapter-react-ui/styles.css` is imported.
