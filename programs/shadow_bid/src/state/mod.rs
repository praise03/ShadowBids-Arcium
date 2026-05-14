use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct PlatformConfig {
    pub authority: Pubkey,
    pub paused: bool,
    pub auction_count: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Auction {
    pub bump: u8,
    pub id: u64,
    pub creator: Pubkey,
    #[max_len(64)]
    pub title: String,
    #[max_len(240)]
    pub description: String,
    #[max_len(16)]
    pub asset_symbol: String,
    pub reserve_price: u64,
    pub min_bid_increment: u64,
    pub start_time: i64,
    pub end_time: i64,
    pub reveal_deadline: i64,
    pub settlement_mode: SettlementMode,
    pub status: AuctionStatus,
    pub bid_count: u32,
    pub settlement_completed: bool,
    pub created_at: i64,
}

#[account]
#[derive(InitSpace)]
pub struct BidCommitment {
    pub bump: u8,
    pub initialized: bool,
    pub auction: Pubkey,
    pub bidder: Pubkey,
    pub commitment: [u8; 32],
    pub bidder_x25519_pubkey: [u8; 32],
    pub nonce: u128,
    pub encrypted_bidder_lo: [u8; 32],
    pub encrypted_bidder_hi: [u8; 32],
    pub encrypted_amount: [u8; 32],
    pub encrypted_submitted_at: [u8; 32],
    pub encrypted_valid: [u8; 32],
    pub submitted_at: i64,
    pub sequence: u32,
}

#[account]
#[derive(InitSpace)]
pub struct AuctionResult {
    pub bump: u8,
    pub auction: Pubkey,
    pub winner: Pubkey,
    pub winning_amount: u64,
    pub winning_bid_submitted_at: i64,
    pub reserve_met: bool,
    pub bid_count: u32,
    pub finalized: bool,
    pub finalized_at: i64,
}

#[account]
#[derive(InitSpace)]
pub struct UserStats {
    pub bump: u8,
    pub initialized: bool,
    pub owner: Pubkey,
    pub auctions_created: u32,
    pub bids_placed: u32,
    pub wins: u32,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum SettlementMode {
    Mock,
    SplTokenScaffold,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum AuctionStatus {
    Upcoming,
    Live,
    Closed,
    Finalizing,
    Finalized,
    ReserveNotMet,
    Failed,
    Cancelled,
}

pub fn init_stats_if_needed(stats: &mut Account<UserStats>, owner: Pubkey, bump: u8) {
    if !stats.initialized {
        stats.owner = owner;
        stats.bump = bump;
        stats.initialized = true;
    }
}
