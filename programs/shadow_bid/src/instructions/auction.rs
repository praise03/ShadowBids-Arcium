use crate::{
    error::ErrorCode,
    init_stats_if_needed,
    state::{Auction, AuctionResult, AuctionStatus, PlatformConfig, SettlementMode, UserStats},
};
use anchor_lang::prelude::*;

const MAX_TITLE: usize = 64;
const MAX_DESCRIPTION: usize = 240;
const MAX_SYMBOL: usize = 16;

#[derive(Accounts)]
pub struct InitializePlatform<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(init, payer = authority, space = 8 + PlatformConfig::INIT_SPACE, seeds = [b"platform"], bump)]
    pub platform_config: Account<'info, PlatformConfig>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetPaused<'info> {
    pub authority: Signer<'info>,
    #[account(mut, seeds = [b"platform"], bump = platform_config.bump, has_one = authority)]
    pub platform_config: Account<'info, PlatformConfig>,
}

#[derive(Accounts)]
#[instruction(auction_id: u64)]
pub struct CreateAuction<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(mut, seeds = [b"platform"], bump = platform_config.bump)]
    pub platform_config: Account<'info, PlatformConfig>,
    #[account(init, payer = creator, space = 8 + Auction::INIT_SPACE, seeds = [b"auction", creator.key().as_ref(), &auction_id.to_le_bytes()], bump)]
    pub auction: Account<'info, Auction>,
    #[account(init, payer = creator, space = 8 + AuctionResult::INIT_SPACE, seeds = [b"result", auction.key().as_ref()], bump)]
    pub result: Account<'info, AuctionResult>,
    #[account(init_if_needed, payer = creator, space = 8 + UserStats::INIT_SPACE, seeds = [b"user-stats", creator.key().as_ref()], bump)]
    pub creator_stats: Account<'info, UserStats>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateAuctionMetadata<'info> {
    pub creator: Signer<'info>,
    #[account(mut)]
    pub auction: Account<'info, Auction>,
}

#[derive(Accounts)]
pub struct CloseBidding<'info> {
    pub closer: Signer<'info>,
    #[account(mut)]
    pub auction: Account<'info, Auction>,
}

#[derive(Accounts)]
pub struct MarkSettlementCompleted<'info> {
    pub creator: Signer<'info>,
    #[account(mut)]
    pub auction: Account<'info, Auction>,
}

#[derive(Accounts)]
pub struct CancelAuction<'info> {
    pub creator: Signer<'info>,
    #[account(mut)]
    pub auction: Account<'info, Auction>,
}

pub fn initialize_platform_handler(ctx: Context<InitializePlatform>) -> Result<()> {
    let config = &mut ctx.accounts.platform_config;
    config.authority = ctx.accounts.authority.key();
    config.paused = false;
    config.auction_count = 0;
    config.bump = ctx.bumps.platform_config;
    Ok(())
}

pub fn set_paused_handler(ctx: Context<SetPaused>, paused: bool) -> Result<()> {
    ctx.accounts.platform_config.paused = paused;
    Ok(())
}

#[allow(clippy::too_many_arguments)]
pub fn create_auction_handler(
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
    require!(
        !ctx.accounts.platform_config.paused,
        ErrorCode::PlatformPaused
    );
    require!(title.len() <= MAX_TITLE, ErrorCode::TextTooLong);
    require!(description.len() <= MAX_DESCRIPTION, ErrorCode::TextTooLong);
    require!(asset_symbol.len() <= MAX_SYMBOL, ErrorCode::TextTooLong);
    require!(reserve_price > 0, ErrorCode::InvalidReserve);
    require!(min_bid_increment > 0, ErrorCode::InvalidIncrement);
    require!(
        start_time < end_time && end_time < reveal_deadline,
        ErrorCode::InvalidTimeWindow
    );

    let auction = &mut ctx.accounts.auction;
    auction.bump = ctx.bumps.auction;
    auction.id = auction_id;
    auction.creator = ctx.accounts.creator.key();
    auction.title = title;
    auction.description = description;
    auction.asset_symbol = asset_symbol;
    auction.reserve_price = reserve_price;
    auction.min_bid_increment = min_bid_increment;
    auction.start_time = start_time;
    auction.end_time = end_time;
    auction.reveal_deadline = reveal_deadline;
    auction.settlement_mode = settlement_mode;
    auction.status = AuctionStatus::Upcoming;
    auction.bid_count = 0;
    auction.settlement_completed = false;
    auction.created_at = Clock::get()?.unix_timestamp;

    let result = &mut ctx.accounts.result;
    result.bump = ctx.bumps.result;
    result.auction = auction.key();
    result.winner = Pubkey::default();
    result.winning_amount = 0;
    result.winning_bid_submitted_at = 0;
    result.reserve_met = false;
    result.bid_count = 0;
    result.finalized = false;
    result.finalized_at = 0;

    ctx.accounts.platform_config.auction_count = ctx
        .accounts
        .platform_config
        .auction_count
        .checked_add(1)
        .ok_or(ErrorCode::MathOverflow)?;

    let creator_stats = &mut ctx.accounts.creator_stats;
    init_stats_if_needed(
        creator_stats,
        ctx.accounts.creator.key(),
        ctx.bumps.creator_stats,
    );
    creator_stats.auctions_created = creator_stats
        .auctions_created
        .checked_add(1)
        .ok_or(ErrorCode::MathOverflow)?;
    Ok(())
}

pub fn update_auction_metadata_handler(
    ctx: Context<UpdateAuctionMetadata>,
    title: String,
    description: String,
    asset_symbol: String,
) -> Result<()> {
    require!(title.len() <= MAX_TITLE, ErrorCode::TextTooLong);
    require!(description.len() <= MAX_DESCRIPTION, ErrorCode::TextTooLong);
    require!(asset_symbol.len() <= MAX_SYMBOL, ErrorCode::TextTooLong);
    require_keys_eq!(
        ctx.accounts.auction.creator,
        ctx.accounts.creator.key(),
        ErrorCode::Unauthorized
    );
    require!(
        Clock::get()?.unix_timestamp < ctx.accounts.auction.start_time,
        ErrorCode::AuctionAlreadyStarted
    );
    require!(
        ctx.accounts.auction.status == AuctionStatus::Upcoming,
        ErrorCode::InvalidStatus
    );
    ctx.accounts.auction.title = title;
    ctx.accounts.auction.description = description;
    ctx.accounts.auction.asset_symbol = asset_symbol;
    Ok(())
}

pub fn close_bidding_handler(ctx: Context<CloseBidding>) -> Result<()> {
    require!(
        Clock::get()?.unix_timestamp >= ctx.accounts.auction.end_time,
        ErrorCode::AuctionStillLive
    );
    require!(
        matches!(
            ctx.accounts.auction.status,
            AuctionStatus::Upcoming | AuctionStatus::Live
        ),
        ErrorCode::InvalidStatus
    );
    ctx.accounts.auction.status = AuctionStatus::Closed;
    Ok(())
}

pub fn mark_settlement_completed_handler(ctx: Context<MarkSettlementCompleted>) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.auction.creator,
        ctx.accounts.creator.key(),
        ErrorCode::Unauthorized
    );
    require!(
        ctx.accounts.auction.status == AuctionStatus::Finalized,
        ErrorCode::InvalidStatus
    );
    ctx.accounts.auction.settlement_completed = true;
    Ok(())
}

pub fn cancel_auction_handler(ctx: Context<CancelAuction>) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.auction.creator,
        ctx.accounts.creator.key(),
        ErrorCode::Unauthorized
    );
    require!(
        ctx.accounts.auction.status == AuctionStatus::Upcoming,
        ErrorCode::InvalidStatus
    );
    require!(ctx.accounts.auction.bid_count == 0, ErrorCode::NoBids);
    require!(
        Clock::get()?.unix_timestamp < ctx.accounts.auction.start_time,
        ErrorCode::AuctionAlreadyStarted
    );
    ctx.accounts.auction.status = AuctionStatus::Cancelled;
    Ok(())
}
