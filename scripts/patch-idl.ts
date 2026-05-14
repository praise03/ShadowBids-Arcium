import * as fs from "fs";

const IDL_PATH = "app/src/idl/shadow_bid.json";

const idl = JSON.parse(fs.readFileSync(IDL_PATH, "utf-8"));

const accountTypes: Record<string, { fields: { name: string; type: any }[]; size: number }> = {
  PlatformConfig: {
    fields: [
      { name: "authority", type: "pubkey" },
      { name: "paused", type: "bool" },
      { name: "auction_count", type: "u64" },
      { name: "bump", type: "u8" },
    ],
    size: 50,
  },
  Auction: {
    fields: [
      { name: "bump", type: "u8" },
      { name: "id", type: "u64" },
      { name: "creator", type: "pubkey" },
      { name: "title", type: { defined: { name: "String" } } },
      { name: "description", type: { defined: { name: "String" } } },
      { name: "asset_symbol", type: { defined: { name: "String" } } },
      { name: "reserve_price", type: "u64" },
      { name: "min_bid_increment", type: "u64" },
      { name: "start_time", type: "i64" },
      { name: "end_time", type: "i64" },
      { name: "reveal_deadline", type: "i64" },
      { name: "settlement_mode", type: { defined: { name: "SettlementMode" } } },
      { name: "status", type: { defined: { name: "AuctionStatus" } } },
      { name: "bid_count", type: "u32" },
      { name: "settlement_completed", type: "bool" },
      { name: "created_at", type: "i64" },
    ],
    size: 444,
  },
  AuctionResult: {
    fields: [
      { name: "bump", type: "u8" },
      { name: "auction", type: "pubkey" },
      { name: "winner", type: "pubkey" },
      { name: "winning_amount", type: "u64" },
      { name: "winning_bid_submitted_at", type: "i64" },
      { name: "reserve_met", type: "bool" },
      { name: "bid_count", type: "u32" },
      { name: "finalized", type: "bool" },
      { name: "finalized_at", type: "i64" },
    ],
    size: 103,
  },
  BidCommitment: {
    fields: [
      { name: "bump", type: "u8" },
      { name: "initialized", type: "bool" },
      { name: "auction", type: "pubkey" },
      { name: "bidder", type: "pubkey" },
      { name: "commitment", type: { array: ["u8", 32] } },
      { name: "bidder_x25519_pubkey", type: { array: ["u8", 32] } },
      { name: "nonce", type: "u128" },
      { name: "encrypted_bidder_lo", type: { array: ["u8", 32] } },
      { name: "encrypted_bidder_hi", type: { array: ["u8", 32] } },
      { name: "encrypted_amount", type: { array: ["u8", 32] } },
      { name: "encrypted_submitted_at", type: { array: ["u8", 32] } },
      { name: "encrypted_valid", type: { array: ["u8", 32] } },
      { name: "submitted_at", type: "i64" },
      { name: "sequence", type: "u32" },
    ],
    size: 326,
  },
  UserStats: {
    fields: [
      { name: "bump", type: "u8" },
      { name: "initialized", type: "bool" },
      { name: "owner", type: "pubkey" },
      { name: "auctions_created", type: "u32" },
      { name: "bids_placed", type: "u32" },
      { name: "wins", type: "u32" },
    ],
    size: 54,
  },
  ArciumSignerAccount: {
    fields: [{ name: "bump", type: "u8" }],
    size: 9,
  },
};

for (const account of idl.accounts) {
  const patch = accountTypes[account.name];
  if (patch) {
    account.type = { kind: "struct", fields: patch.fields };
    account.size = patch.size;
  }
}

fs.writeFileSync(IDL_PATH, JSON.stringify(idl, null, 2) + "\n");
console.log("Patched IDL with account types and sizes");
