use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Platform is paused")]
    PlatformPaused,
    #[msg("Text field exceeds maximum length")]
    TextTooLong,
    #[msg("Reserve price must be greater than zero")]
    InvalidReserve,
    #[msg("Minimum bid increment must be greater than zero")]
    InvalidIncrement,
    #[msg("Invalid auction time window")]
    InvalidTimeWindow,
    #[msg("Auction has already started")]
    AuctionAlreadyStarted,
    #[msg("Auction has not started")]
    AuctionNotStarted,
    #[msg("Auction has ended")]
    AuctionEnded,
    #[msg("Auction is still live")]
    AuctionStillLive,
    #[msg("Invalid status transition")]
    InvalidStatus,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Auction already finalized")]
    AlreadyFinalized,
    #[msg("No bids were submitted")]
    NoBids,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Exactly eight bid accounts are required for compute")]
    InvalidBidAccountCount,
    #[msg("Bid account does not belong to this auction")]
    BidAuctionMismatch,
    #[msg("Computation output verification failed")]
    AbortedComputation,
    #[msg("Auction result account mismatch")]
    AuctionResultMismatch,
}
