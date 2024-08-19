// import the from the state module
use crate::error::ErrorCode;
use crate::event::*;
use anchor_lang::prelude::*;

pub const INIT_SEED: &[u8] = b"InitializedSeed";

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(init, payer = owner, space = 8 + InitializeVault::INIT_SPACE, seeds = [INIT_SEED], bump)]
    pub vault: Account<'info, InitializeVault>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct InitializeVault {
    pub minimum_deposit: u128,
    pub usdc_token: Pubkey,
    pub owner: Pubkey,
    pub fee_receiver: Pubkey,
    pub fee: u128,
    pub mbps: u128,
    pub deposit_initialized: bool,
}

#[derive(Accounts)]
pub struct SetUSDCToken<'info> {
    #[account(mut, seeds = [INIT_SEED], bump)]
    pub vault: Account<'info, InitializeVault>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetFeeReceiverAndFeePercent<'info> {
    #[account(mut, seeds = [INIT_SEED], bump)]
    pub vault: Account<'info, InitializeVault>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetDepositStatus<'info> {
    #[account(mut, seeds = [INIT_SEED], bump)]
    pub vault: Account<'info, InitializeVault>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}


pub fn set_states_values(
    ctx: Context<Initialize>, 
    fee_receiver: Pubkey, 
    usdc_token: Pubkey, 
    minimum_deposit: u128,
    fee_percent: u128,
    vault_init: bool,
) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    // check if owner hasn't been set
    if vault.owner != Pubkey::default() && vault.owner != *ctx.accounts.owner.key {
        return Err(ErrorCode::OwnerAlreadySet.into());
    }
    let clock = Clock::get()?;
    // check if the vault is already initialized
    if vault.deposit_initialized {
        return Err(ErrorCode::DepositInitialized.into());
    }
    vault.minimum_deposit = minimum_deposit;
    vault.usdc_token = usdc_token;
    vault.owner = *ctx.accounts.owner.key;
    vault.fee_receiver = fee_receiver;
    vault.fee = fee_percent; // 0.1%
    vault.mbps = 1000;
    vault.deposit_initialized = vault_init;
    // emit the SetStates event
    emit!(SetStates {
        fee_receiver: vault.fee_receiver,
        usdc_token: vault.usdc_token,
        minimum_deposit: vault.minimum_deposit as u128,
        fee: vault.fee,
        timestamp: clock.unix_timestamp,
    });
    Ok(())
}

//  create an internal function to set usdc token
pub fn set_usdc_token(ctx: Context<SetUSDCToken>, usdc_token: Pubkey) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    // // only the owner can set the usdc token
    // if vault.owner != *ctx.accounts.user.key {
    //     return Err(ErrorCode::CallerIsNotOwner.into());
    // }

    // usdc_token is not zero 
    if usdc_token == Pubkey::default() {
        return Err(ErrorCode::NoZeroAddress.into());
    }
    vault.usdc_token = usdc_token;
    // emit the SetUSDCToken event
    emit!(SetUSDC {
        usdc_token: vault.usdc_token,
    });
    Ok(())
}

//  create an internal function to set fee receiver and fee percent
pub fn set_fee_receiver_and_fee_percent(ctx: Context<SetFeeReceiverAndFeePercent>, fee_receiver: Pubkey, fee_percent: u128) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    // only the owner can set the fee receiver and fee percent
    // if vault.owner != *ctx.accounts.user.key {
    //     return Err(ErrorCode::CallerIsNotOwner.into());
    // }

    // fee_receiver is not zero 
    if fee_receiver == Pubkey::default() && fee_percent != 0 {
        return Err(ErrorCode::NoZeroAddress.into());
    }
    // fee percent is not greater than maximum fee percent
    if fee_percent > vault.mbps {
        return Err(ErrorCode::FeePercentTooHigh.into());
    }
    vault.fee_receiver = fee_receiver;
    vault.fee = fee_percent;
    // emit the SetFeeReceiverAndFeePercent event
    emit!(SetFeeReceiverAndFee {
        fee_receiver: vault.fee_receiver,
        fee_percent: vault.fee,
    });
    Ok(())
}

// disable deposit_initialized
pub fn set_deposit_status(ctx: Context<SetDepositStatus>, status: bool) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    // only the owner can disable the deposit_initialized
    // if vault.owner != *ctx.accounts.user.key {
    //     return Err(ErrorCode::CallerIsNotOwner.into());
    // }

    vault.deposit_initialized = status;
    // emit the deposit status event
    emit!(InitializedStatus {
        status: vault.deposit_initialized,
    });
    Ok(())
}

fn to_decimal(amount: u64, decimals: u32) -> f64 {
    amount as f64 / 10u64.pow(decimals) as f64
}

fn from_decimal(amount: f64, decimals: u32) -> u64 {
    (amount * 10u64.pow(decimals) as f64) as u64
}

