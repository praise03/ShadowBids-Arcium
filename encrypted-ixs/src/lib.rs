use arcis::*;

#[encrypted]
mod circuits {
    use arcis::*;

    pub const MAX_BIDS: usize = 8;

    #[derive(Copy, Clone)]
    pub struct SealedBid {
        pub bidder_lo: u128,
        pub bidder_hi: u128,
        pub amount: u64,
        pub submitted_at: u64,
        pub valid: u8,
    }

    #[instruction]
    pub fn compute_winner(
        reserve_price: u64,
        min_bid_increment: u64,
        bid_count: u64,
        bid_0_ctxt: Enc<Shared, SealedBid>,
        bid_1_ctxt: Enc<Shared, SealedBid>,
        bid_2_ctxt: Enc<Shared, SealedBid>,
        bid_3_ctxt: Enc<Shared, SealedBid>,
        bid_4_ctxt: Enc<Shared, SealedBid>,
        bid_5_ctxt: Enc<Shared, SealedBid>,
        bid_6_ctxt: Enc<Shared, SealedBid>,
        bid_7_ctxt: Enc<Shared, SealedBid>,
    ) -> (u128, u128, u64, u64, u8, u64) {
        let bids = [
            bid_0_ctxt.to_arcis(),
            bid_1_ctxt.to_arcis(),
            bid_2_ctxt.to_arcis(),
            bid_3_ctxt.to_arcis(),
            bid_4_ctxt.to_arcis(),
            bid_5_ctxt.to_arcis(),
            bid_6_ctxt.to_arcis(),
            bid_7_ctxt.to_arcis(),
        ];

        let mut winning_bidder_lo = 0u128;
        let mut winning_bidder_hi = 0u128;
        let mut winning_amount = 0u64;
        let mut winning_submitted_at = 0u64;
        let mut reserve_met = 0u8;

        for i in 0..MAX_BIDS {
            let bid = bids[i];
            let meets_reserve = bid.amount >= reserve_price;
            let meets_increment =
                winning_amount == 0 || bid.amount >= winning_amount + min_bid_increment;
            let beats_current = bid.amount > winning_amount;
            let earlier_tie = bid.amount == winning_amount
                && winning_submitted_at != 0
                && bid.submitted_at < winning_submitted_at;
            let valid_bid = bid.valid == 1 && meets_reserve;

            if valid_bid && ((beats_current && meets_increment) || earlier_tie) {
                winning_bidder_lo = bid.bidder_lo;
                winning_bidder_hi = bid.bidder_hi;
                winning_amount = bid.amount;
                winning_submitted_at = bid.submitted_at;
                reserve_met = 1;
            }
        }

        (
            winning_bidder_lo.reveal(),
            winning_bidder_hi.reveal(),
            winning_amount.reveal(),
            winning_submitted_at.reveal(),
            reserve_met.reveal(),
            bid_count.reveal(),
        )
    }
}
