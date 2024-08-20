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
    pub minimum_stake: u128,
    pub usdc_token: Pubkey,
    pub owner: Pubkey,
    pub fee_receiver: Pubkey,
    pub fee: u128,
    pub mbps: u128,
    pub stake_initialized: bool,
    pub total_staked: u128,
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
pub struct SetStakeStatus<'info> {
    #[account(mut, seeds = [INIT_SEED], bump)]
    pub vault: Account<'info, InitializeVault>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct UserStake {
    pub staked_amount: u128,
}


#[derive(Accounts)]
pub struct Stake<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(init_if_needed, payer = user, space = 8 + UserStake::INIT_SPACE, seeds = [b"USER_INFOS".as_ref(), user.key().as_ref()], bump)]
    pub user_infos: Account<'info, UserStake>,
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

#[derive(Accounts)]
pub struct Unstake<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut, seeds = [b"USER_INFOS".as_ref(), user.key().as_ref()], bump)]
    pub user_infos: Account<'info, UserStake>,
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
    minimum_stake: u128,
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
    if vault.stake_initialized {
        return Err(ErrorCode::StakeInitialized.into());
    }
    vault.minimum_stake = minimum_stake;
    vault.usdc_token = usdc_token;
    vault.owner = *ctx.accounts.owner.key;
    vault.fee_receiver = fee_receiver;
    vault.fee = fee_percent; // 0.1%
    vault.mbps = 1000;
    vault.stake_initialized = vault_init;
    vault.total_staked = 0;
    // emit the SetStates event
    emit!(SetStates {
        fee_receiver: vault.fee_receiver,
        usdc_token: vault.usdc_token,
        minimum_stake: vault.minimum_stake as u128,
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

// disable stake_initialized
pub fn set_stake_status(ctx: Context<SetStakeStatus>, status: bool) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    // only the owner can disable the stake_initialized
    if vault.owner != *ctx.accounts.user.key {
        return Err(ErrorCode::CallerIsNotOwner.into());
    }

    vault.stake_initialized = status;
    // emit the stake status event
    emit!(InitializedStatus {
        status: vault.stake_initialized,
    });
    Ok(())
}

//  create an internal function to Stake
pub fn stake(ctx: Context<Stake>, stake_amount: u64) -> Result<()> {
    let usdc_token = &ctx.accounts.usdc_token;
    let user_ata = &ctx.accounts.user_ata;
    let program_authority = &ctx.accounts.program_authority;
    let usdc_mint = &ctx.accounts.usdc_mint;
    let user_stake = &mut ctx.accounts.user_infos;
    let vault = &mut ctx.accounts.vault;

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

    // update the total staked amount and check for overflow
    vault.total_staked = vault.total_staked.checked_add(stake_amount as u128).unwrap();

    // update the user stake amount and check for overflow
    user_stake.staked_amount = user_stake.staked_amount.checked_add(stake_amount as u128).unwrap();


    Ok(())
}

//  create an internal function to withdraw
pub fn unstake(ctx: Context<Unstake>, unstake_amount: u64) -> Result<()> {
    let usdc_token = &ctx.accounts.usdc_token;
    let user_ata = &ctx.accounts.user_ata;
    let program_authority = &ctx.accounts.program_authority;
    let usdc_mint = &ctx.accounts.usdc_mint;
    let user_stake = &mut ctx.accounts.user_infos;
    let vault = &mut ctx.accounts.vault;

    // amount is not zero
    if unstake_amount == 0 {
        return Err(ErrorCode::NoZeroAmount.into());
    }

    // Ensure the user has enough staked to withdraw
    if user_stake.staked_amount < unstake_amount as u128 {
        return Err(ErrorCode::InsufficientStakedAmount.into());
    }

    // amount must be less than total staked amount
    if vault.total_staked < unstake_amount as u128 {
        return Err(ErrorCode::InsufficientStakedAmount.into());
    }

    // Manually deserialize the `usdc_token` and `user_ata` accounts
    let usdc_token_account: TokenAccount = TokenAccount::try_deserialize(&mut &usdc_token.data.borrow_mut()[..])?;
    let user_ata_account: TokenAccount = TokenAccount::try_deserialize(&mut &user_ata.data.borrow_mut()[..])?;

    // Manually validate the constraints
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

    // Update the user's staked amount
    user_stake.staked_amount = user_stake.staked_amount.checked_sub(unstake_amount as u128).unwrap();

    // Update the vault's total staked amount
    vault.total_staked = vault.total_staked.checked_sub(unstake_amount as u128).unwrap();

    let (_program_authority, program_authority_bump) = Pubkey::find_program_address(&[AUTHORITY_SEED], &ctx.program_id);
    
    let authority_seeds = &[AUTHORITY_SEED.as_ref(), &[program_authority_bump]];
    let signer_seeds = &[&authority_seeds[..]];

    let fee_transfer_accounts = TransferChecked {
        from: ctx.accounts.usdc_token.to_account_info(),
        to: ctx.accounts.user_ata.to_account_info(),
        authority: ctx.accounts.program_authority.to_account_info(),
        mint: ctx.accounts.usdc_mint.to_account_info(),
    };

    let fee_amount_context = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        fee_transfer_accounts,
        signer_seeds,
    );
    anchor_spl::token::transfer_checked(fee_amount_context, unstake_amount, 6)?;
    Ok(())
}
