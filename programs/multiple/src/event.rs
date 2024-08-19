use anchor_lang::prelude::*;

#[event]
pub struct SetStates {
    pub fee_receiver: Pubkey,
    pub usdc_token: Pubkey,
    pub minimum_deposit: u128,
    pub fee: u128,
    pub timestamp: i64,
}

#[event]
pub struct SetUSDC {
    pub usdc_token: Pubkey,
}

#[event]
pub struct SetFeeReceiverAndFee {
    pub fee_receiver: Pubkey,
    pub fee_percent: u128,
}

#[event]
pub struct InitializedStatus {
    pub status: bool,
}