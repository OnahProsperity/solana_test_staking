use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Deposit is already initialized")]
    DepositInitialized,
    #[msg("Owner has already been set")]
    OwnerAlreadySet,
    #[msg("Caller is not owner")]
    CallerIsNotOwner,
    #[msg("No zero address allowed")]
    NoZeroAddress,
    #[msg("Fee percent is too high")]
    FeePercentTooHigh,
}
