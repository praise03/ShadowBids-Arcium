use crate::{
    constants::{COMP_DEF_OFFSET_COMPUTE_WINNER, MAX_BIDS},
    error::ErrorCode,
    init_stats_if_needed,
    state::{Auction, AuctionResult, AuctionStatus, BidCommitment, PlatformConfig, UserStats},
    ArciumSignerAccount,
    ID,
    ID_CONST,
};
use anchor_lang::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;
use arcium_anchor::prelude::*;

#[derive(Accounts)]
pub struct SubmitBidCommitment<'info> {
    #[account(mut)]
    pub bidder: Signer<'info>,
    #[account(seeds = [b"platform"], bump = platform_config.bump)]
    pub platform_config: Account<'info, PlatformConfig>,
    #[account(mut)]
    pub auction: Account<'info, Auction>,
    #[account(init_if_needed, payer = bidder, space = 8 + BidCommitment::INIT_SPACE, seeds = [b"bid", auction.key().as_ref(), bidder.key().as_ref()], bump)]
    pub bid_commitment: Account<'info, BidCommitment>,
    #[account(init_if_needed, payer = bidder, space = 8 + UserStats::INIT_SPACE, seeds = [b"user-stats", bidder.key().as_ref()], bump)]
    pub bidder_stats: Account<'info, UserStats>,
    pub system_program: Program<'info, System>,
}

#[queue_computation_accounts("compute_winner", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct TriggerConfidentialCompute<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init_if_needed,
        space = 9,
        payer = payer,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, ArciumSignerAccount>,
    #[account(mut)]
    pub auction: Account<'info, Auction>,
    #[account(mut, seeds = [b"result", auction.key().as_ref()], bump = result.bump)]
    pub result: Account<'info, AuctionResult>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut, address = derive_mempool_pda!(mxe_account))]
    /// CHECK: Checked by Arcium
    pub mempool_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_execpool_pda!(mxe_account))]
    /// CHECK: Checked by Arcium
    pub executing_pool: UncheckedAccount<'info>,
    #[account(mut, address = derive_comp_pda!(computation_offset, mxe_account))]
    /// CHECK: Checked by Arcium
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_COMPUTE_WINNER))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,
    #[account(mut, address = derive_cluster_pda!(mxe_account))]
    pub cluster_account: Box<Account<'info, Cluster>>,
    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Account<'info, FeePool>,
    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Account<'info, ClockAccount>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

#[callback_accounts("compute_winner")]
#[derive(Accounts)]
pub struct ComputeWinnerCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_COMPUTE_WINNER))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    /// CHECK: validated by Arcium
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_cluster_pda!(mxe_account))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(address = ::arcium_anchor::solana_instructions_sysvar::ID)]
    /// CHECK: validated by address constraint
    pub instructions_sysvar: UncheckedAccount<'info>,
    #[account(mut)]
    pub auction: Account<'info, Auction>,
    #[account(mut, seeds = [b"result", auction.key().as_ref()], bump = result.bump)]
    pub result: Account<'info, AuctionResult>,
}

#[init_computation_definition_accounts("compute_winner", payer)]
#[derive(Accounts)]
pub struct InitComputeWinnerCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: checked by Arcium
    pub comp_def_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_mxe_lut_pda!(mxe_account.lut_offset_slot))]
    /// CHECK: checked by Arcium
    pub address_lookup_table: UncheckedAccount<'info>,
    #[account(address = LUT_PROGRAM_ID)]
    /// CHECK: address lookup table program
    pub lut_program: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

pub fn submit_bid_commitment_handler(
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
    require!(
        !ctx.accounts.platform_config.paused,
        ErrorCode::PlatformPaused
    );
    let now = Clock::get()?.unix_timestamp;
    require!(
        now >= ctx.accounts.auction.start_time,
        ErrorCode::AuctionNotStarted
    );
    require!(now < ctx.accounts.auction.end_time, ErrorCode::AuctionEnded);
    require!(
        matches!(
            ctx.accounts.auction.status,
            AuctionStatus::Upcoming | AuctionStatus::Live
        ),
        ErrorCode::InvalidStatus
    );

    let bid = &mut ctx.accounts.bid_commitment;
    let is_new = !bid.initialized;
    if is_new {
        bid.bump = ctx.bumps.bid_commitment;
        bid.initialized = true;
        bid.auction = ctx.accounts.auction.key();
        bid.bidder = ctx.accounts.bidder.key();
        bid.sequence = 0;
        ctx.accounts.auction.bid_count = ctx
            .accounts
            .auction
            .bid_count
            .checked_add(1)
            .ok_or(ErrorCode::MathOverflow)?;
    }

    bid.commitment = commitment;
    bid.bidder_x25519_pubkey = bidder_x25519_pubkey;
    bid.nonce = nonce;
    bid.encrypted_bidder_lo = encrypted_bidder_lo;
    bid.encrypted_bidder_hi = encrypted_bidder_hi;
    bid.encrypted_amount = encrypted_amount;
    bid.encrypted_submitted_at = encrypted_submitted_at;
    bid.encrypted_valid = encrypted_valid;
    bid.submitted_at = now;
    bid.sequence = bid.sequence.checked_add(1).ok_or(ErrorCode::MathOverflow)?;

    ctx.accounts.auction.status = AuctionStatus::Live;

    let bidder_stats = &mut ctx.accounts.bidder_stats;
    init_stats_if_needed(
        bidder_stats,
        ctx.accounts.bidder.key(),
        ctx.bumps.bidder_stats,
    );
    if is_new {
        bidder_stats.bids_placed = bidder_stats
            .bids_placed
            .checked_add(1)
            .ok_or(ErrorCode::MathOverflow)?;
    }
    Ok(())
}

pub fn init_compute_winner_comp_def_handler(ctx: Context<InitComputeWinnerCompDef>) -> Result<()> {
    init_comp_def(ctx.accounts, None, None)?;
    Ok(())
}

pub fn trigger_confidential_compute_handler(
    ctx: Context<TriggerConfidentialCompute>,
    computation_offset: u64,
) -> Result<()> {
    require!(
        ctx.accounts.auction.status == AuctionStatus::Closed,
        ErrorCode::InvalidStatus
    );
    require!(
        ctx.remaining_accounts.len() == MAX_BIDS,
        ErrorCode::InvalidBidAccountCount
    );

    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    let mut args = ArgBuilder::new()
        .plaintext_u64(ctx.accounts.auction.reserve_price)
        .plaintext_u64(ctx.accounts.auction.min_bid_increment)
        .plaintext_u64(ctx.accounts.auction.bid_count as u64);

    let mut callback_accounts = vec![
        CallbackAccount {
            pubkey: ctx.accounts.auction.key(),
            is_writable: true,
        },
        CallbackAccount {
            pubkey: ctx.accounts.result.key(),
            is_writable: true,
        },
    ];

    for account_info in ctx.remaining_accounts.iter() {
        let bid_account = Account::<BidCommitment>::try_from(account_info)?;
        require_keys_eq!(
            bid_account.auction,
            ctx.accounts.auction.key(),
            ErrorCode::BidAuctionMismatch
        );
        args = args
            .x25519_pubkey(bid_account.bidder_x25519_pubkey)
            .plaintext_u128(bid_account.nonce)
            .encrypted_u128(bid_account.encrypted_bidder_lo)
            .encrypted_u128(bid_account.encrypted_bidder_hi)
            .encrypted_u64(bid_account.encrypted_amount)
            .encrypted_u64(bid_account.encrypted_submitted_at)
            .encrypted_u8(bid_account.encrypted_valid);

        callback_accounts.push(CallbackAccount {
            pubkey: Pubkey::find_program_address(
                &[b"user-stats", bid_account.bidder.as_ref()],
                &crate::ID,
            )
            .0,
            is_writable: true,
        });
    }

    ctx.accounts.auction.status = AuctionStatus::Finalizing;
    ctx.accounts.result.bid_count = ctx.accounts.auction.bid_count;
    queue_computation(
        ctx.accounts,
        computation_offset,
        args.build(),
        vec![ComputeWinnerCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &callback_accounts,
        )?],
        1,
        0,
    )?;
    Ok(())
}

pub fn compute_winner_callback_handler(
    ctx: Context<ComputeWinnerCallback>,
    output: SignedComputationOutputs<ComputeWinnerOutput>,
) -> Result<()> {
    let verified = output
        .verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        )
        .map_err(|_| ErrorCode::AbortedComputation)?;

    let compute_winner_output = verified.field_0;
    let winner =
        winner_pubkey_from_halves(compute_winner_output.field_0, compute_winner_output.field_1)?;
    let winning_amount = compute_winner_output.field_2;
    let winning_bid_submitted_at = compute_winner_output.field_3 as i64;
    let reserve_met = compute_winner_output.field_4 == 1;
    let bid_count = compute_winner_output.field_5 as u32;

    ctx.accounts.auction.status = if reserve_met {
        AuctionStatus::Finalized
    } else {
        AuctionStatus::ReserveNotMet
    };

    let result = &mut ctx.accounts.result;
    require_keys_eq!(
        result.auction,
        ctx.accounts.auction.key(),
        ErrorCode::AuctionResultMismatch
    );
    result.winner = winner;
    result.winning_amount = winning_amount;
    result.winning_bid_submitted_at = winning_bid_submitted_at;
    result.reserve_met = reserve_met;
    result.bid_count = bid_count;
    result.finalized = true;
    result.finalized_at = Clock::get()?.unix_timestamp;

    if reserve_met {
        for account_info in ctx.remaining_accounts.iter() {
            let mut stats = Account::<UserStats>::try_from(account_info)?;
            if stats.owner == winner {
                stats.wins = stats.wins.checked_add(1).ok_or(ErrorCode::MathOverflow)?;
                break;
            }
        }
    }
    Ok(())
}

fn winner_pubkey_from_halves(lo: u128, hi: u128) -> Result<Pubkey> {
    let mut bytes = [0u8; 32];
    bytes[..16].copy_from_slice(&lo.to_le_bytes());
    bytes[16..].copy_from_slice(&hi.to_le_bytes());
    Ok(Pubkey::new_from_array(bytes))
}
