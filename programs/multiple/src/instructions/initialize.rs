// import the from the state module
use crate::error::ErrorCode;
use crate::event::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount, TransferChecked};

pub const INIT_SEED: &[u8] = b"InitializedSeed";
pub const AUTHORITY_SEED: &[u8] = b"AuthoritySeed";

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

#[account]
#[derive(InitSpace)]
pub struct UserBalance {
    pub shares: u128,
}


#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(init_if_needed, payer = user, space = 8 + UserBalance::INIT_SPACE, seeds = [b"USER_INFOS".as_ref(), user.key().as_ref()], bump)]
    pub user_infos: Account<'info, UserBalance>,
    #[account(mut, seeds = [INIT_SEED], bump)]
    pub vault: Account<'info, InitializeVault>,
    pub system_program: Program<'info, System>,
    #[account(mut)]
    /// CHECK: This is safe because we manually validate the owner and mint fields in the instruction logic.
    pub usdc_token: AccountInfo<'info>,
    #[account(mut)]
    /// CHECK: This is safe because we manually validate the owner and mint fields in the instruction logic.
    pub user_ata: AccountInfo<'info>,
    pub token_program: Program<'info, Token>,
    #[account(mut, seeds = [AUTHORITY_SEED], bump)]
    pub program_authority: SystemAccount<'info>,
    #[account(constraint = usdc_mint.key() == vault.usdc_token.key())]
    /// CHECK: usdc mint must be the same as the strategy usdc mint
    pub usdc_mint: AccountInfo<'info>,
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
    if vault.owner != *ctx.accounts.user.key {
        return Err(ErrorCode::CallerIsNotOwner.into());
    }

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
    if vault.owner != *ctx.accounts.user.key {
        return Err(ErrorCode::CallerIsNotOwner.into());
    }

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
    if vault.owner != *ctx.accounts.user.key {
        return Err(ErrorCode::CallerIsNotOwner.into());
    }

    vault.deposit_initialized = status;
    // emit the deposit status event
    emit!(InitializedStatus {
        status: vault.deposit_initialized,
    });
    Ok(())
}

//  create an internal function to deposit
pub fn stake(ctx: Context<Deposit>, stake_amount: u64) -> Result<()> {
    let usdc_token = &ctx.accounts.usdc_token;
    let user_ata = &ctx.accounts.user_ata;
    let program_authority = &ctx.accounts.program_authority;
    let usdc_mint = &ctx.accounts.usdc_mint;

    // amount is not zero
    if stake_amount == 0 {
        return Err(ErrorCode::NoZeroAmount.into());
    }

    // Manually deserialize the `usdc_token` and `user_ata` accounts
    let usdc_token_account: TokenAccount = TokenAccount::try_deserialize(&mut &usdc_token.data.borrow_mut()[..])?;
    let user_ata_account: TokenAccount = TokenAccount::try_deserialize(&mut &user_ata.data.borrow_mut()[..])?;

    // Not able to add some constraint, so need to Manually validate the constraints
    if usdc_token_account.owner != program_authority.key() {
        return Err(ErrorCode::InvalidOwner.into());
    }
    if usdc_token_account.mint != usdc_mint.key() {
        return Err(ErrorCode::InvalidMint.into());
    }
    if user_ata_account.owner != ctx.accounts.user.key() {
        return Err(ErrorCode::InvalidUserATAOwner.into());
    }
    if user_ata_account.mint != usdc_mint.key() {
        return Err(ErrorCode::InvalidMint.into());
    }

    let net_amount_transfer_accounts = TransferChecked {
        from: ctx.accounts.user_ata.to_account_info(),
        to: ctx.accounts.usdc_token.to_account_info(),
        authority: ctx.accounts.user.to_account_info(), // User is the authority
        mint: ctx.accounts.usdc_mint.to_account_info(),
    };
    let net_amount_context = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        net_amount_transfer_accounts,
    );
    anchor_spl::token::transfer_checked(net_amount_context, stake_amount, 6)?;

    Ok(())
}

fn to_decimal(amount: u64, decimals: u32) -> f64 {
    amount as f64 / 10u64.pow(decimals) as f64
}

fn from_decimal(amount: f64, decimals: u32) -> u64 {
    (amount * 10u64.pow(decimals) as f64) as u64
}

