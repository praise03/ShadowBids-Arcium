# ShadowBid Developer Walkthrough

This walkthrough gets a new developer from zero to a running ShadowBid demo.

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

Expected output: npm installs workspace dependencies, and Solana CLI points at localhost.

## Local Validator

Run a validator in a separate terminal:

```bash
solana-test-validator
```

Expected output: the validator prints an RPC URL at `http://127.0.0.1:8899`.

## Program Build

```bash
yarn build:arcium
```

Expected output: Arcium rebuilds the encrypted instruction interface when needed, compiles the native `shadow_bid` program, and syncs the declared program id automatically.

## Program Tests

```bash
yarn test:e2e
```

Expected output: the artifact-level native-path scaffold passes, and the real localnet flow is skipped unless you explicitly enable it with `SHADOWBID_RUN_REAL_E2E=1`.

If you do not have a validator running, use the deterministic mock:

```bash
yarn test:e2e:mock
```

Expected output: three passing tests for happy path, reserve-not-met, and tie-break behavior.

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

To extend the current scaffold into a true localnet E2E, add:
- MXE public key fetching with retry
- x25519 key agreement
- `RescueCipher` encryption with fresh nonces
- matching `ArgBuilder` ordering for every `Enc<Shared, ...>` parameter

## Frontend

```bash
yarn dev
```

Expected output: Next.js starts at `http://localhost:3000`.

Open the app, connect Solflare on devnet, and walk through:

1. `/` shows the auction desk.
2. `/auctions` shows filters and auction cards.
3. `/auctions/validator-seat` shows bid, lifecycle, privacy, and result panels.
4. `/create` shows the creator flow.
5. `/portfolio` and `/leaderboard` show reputation-lite state.

## Common Fixes

- `arcium: command not found`: install Arcium CLI and restart your shell.
- `Account not initialized`: run `initialize_platform` before auction instructions.
- `AuctionStillLive`: wait until `end_time` or create a shorter test auction.
- `Missing real E2E run`: export `SHADOWBID_RUN_REAL_E2E=1` only after local Arcium infra is live.
- Frontend wallet modal missing styles: confirm `@solana/wallet-adapter-react-ui/styles.css` is imported.
