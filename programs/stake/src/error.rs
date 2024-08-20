use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Deposit is already initialized")]
    StakeInitialized,
    #[msg("Owner has already been set")]
    OwnerAlreadySet,
    #[msg("Caller is not owner")]
    CallerIsNotOwner,
    #[msg("No zero address allowed")]
    NoZeroAddress,
    #[msg("Fee percent is too high")]
    FeePercentTooHigh,
    #[msg("The owner of the usdc_token account is invalid.")]
    InvalidOwner,
    #[msg("The mint of the token account is invalid.")]
    InvalidMint,
    #[msg("The owner of the user's ATA is invalid.")]
    InvalidUserATAOwner,
    #[msg("The amount is zero.")]
    NoZeroAmount,
    #[msg("The amount is greater than the user's staked amount.")]
    InsufficientStakedAmount,
    
}
