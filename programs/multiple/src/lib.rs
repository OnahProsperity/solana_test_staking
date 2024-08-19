pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;
pub mod event;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;
pub use event::*;

declare_id!("9bik7qGJDvUMDwzFHGm1GtYydaDpLsCsv5vHGephUcX");

#[program]
pub mod multiple {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        fee_receiver: Pubkey, 
        usdc_token: Pubkey, 
        minimum_deposit: u128,
        fee_percent: u128,
        vault_init: bool,
    ) -> Result<()> {
        initialize::set_states_values(ctx, fee_receiver, usdc_token, minimum_deposit, fee_percent, vault_init)
    }

    pub fn set_usdc_token(ctx: Context<SetUSDCToken>, usdc_token: Pubkey) -> Result<()> {
        initialize::set_usdc_token(ctx, usdc_token)
    }

    pub fn set_fee_receiver_and_fee_percent(ctx: Context<SetFeeReceiverAndFeePercent>, fee_receiver: Pubkey, fee_percent: u128) -> Result<()> {
        initialize::set_fee_receiver_and_fee_percent(ctx, fee_receiver, fee_percent)
    }

    pub fn set_deposit_status(ctx: Context<SetDepositStatus>, status: bool) -> Result<()> {
        initialize::set_deposit_status(ctx, status)
    }
}
