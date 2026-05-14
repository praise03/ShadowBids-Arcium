pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("F4tKBoryaS7kaQH2Hh1CxrQDRz4HRipVEztf5p5cT5wf");

#[arcium_program]
pub mod shadow_bid {
    use super::*;

    pub fn initialize_platform(ctx: Context<InitializePlatform>) -> Result<()> {
        auction::initialize_platform_handler(ctx)
    }

    pub fn set_paused(ctx: Context<SetPaused>, paused: bool) -> Result<()> {
        auction::set_paused_handler(ctx, paused)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn create_auction(
        ctx: Context<CreateAuction>,
        auction_id: u64,
        title: String,
        description: String,
        asset_symbol: String,
        reserve_price: u64,
        min_bid_increment: u64,
        start_time: i64,
        end_time: i64,
        reveal_deadline: i64,
        settlement_mode: SettlementMode,
    ) -> Result<()> {
        auction::create_auction_handler(
            ctx,
            auction_id,
            title,
            description,
            asset_symbol,
            reserve_price,
            min_bid_increment,
            start_time,
            end_time,
            reveal_deadline,
            settlement_mode,
        )
    }

    pub fn update_auction_metadata(
        ctx: Context<UpdateAuctionMetadata>,
        title: String,
        description: String,
        asset_symbol: String,
    ) -> Result<()> {
        auction::update_auction_metadata_handler(ctx, title, description, asset_symbol)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn submit_bid_commitment(
        ctx: Context<SubmitBidCommitment>,
        commitment: [u8; 32],
        bidder_x25519_pubkey: [u8; 32],
        nonce: u128,
        encrypted_bidder_lo: [u8; 32],
        encrypted_bidder_hi: [u8; 32],
        encrypted_amount: [u8; 32],
        encrypted_submitted_at: [u8; 32],
        encrypted_valid: [u8; 32],
    ) -> Result<()> {
        compute_winner::submit_bid_commitment_handler(
            ctx,
            commitment,
            bidder_x25519_pubkey,
            nonce,
            encrypted_bidder_lo,
            encrypted_bidder_hi,
            encrypted_amount,
            encrypted_submitted_at,
            encrypted_valid,
        )
    }

    pub fn close_bidding(ctx: Context<CloseBidding>) -> Result<()> {
        auction::close_bidding_handler(ctx)
    }

    pub fn init_compute_winner_comp_def(ctx: Context<InitComputeWinnerCompDef>) -> Result<()> {
        compute_winner::init_compute_winner_comp_def_handler(ctx)
    }

    pub fn trigger_confidential_compute(
        ctx: Context<TriggerConfidentialCompute>,
        computation_offset: u64,
    ) -> Result<()> {
        compute_winner::trigger_confidential_compute_handler(ctx, computation_offset)
    }

    #[arcium_callback(encrypted_ix = "compute_winner")]
    pub fn compute_winner_callback(
        ctx: Context<ComputeWinnerCallback>,
        output: SignedComputationOutputs<ComputeWinnerOutput>,
    ) -> Result<()> {
        compute_winner::compute_winner_callback_handler(ctx, output)
    }

    pub fn mark_settlement_completed(ctx: Context<MarkSettlementCompleted>) -> Result<()> {
        auction::mark_settlement_completed_handler(ctx)
    }

    pub fn cancel_auction(ctx: Context<CancelAuction>) -> Result<()> {
        auction::cancel_auction_handler(ctx)
    }
}
