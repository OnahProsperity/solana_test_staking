import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";

interface Vault {
	owner: PublicKey;
	feeReceiver: PublicKey;
	usdcToken: PublicKey;
	minimumDeposit: anchor.BN;
	fee: anchor.BN;
	mbps: anchor.BN;
	depositInitialized: boolean;
}
// retrieve the vault data and return the vault interface
export const getVaultData = async (
	vaultPda: PublicKey,
	program: Program<Multiple>
): Promise<Vault> => {
    const vaultAccount = await program.account.initializeVault.fetch(vaultPda);
    return {
			owner: vaultAccount.owner,
			feeReceiver: vaultAccount.feeReceiver,
			usdcToken: vaultAccount.usdcToken,
			minimumDeposit: vaultAccount.minimumDeposit,
			fee: vaultAccount.fee,
			mbps: vaultAccount.mbps,
			depositInitialized: vaultAccount.depositInitialized,
		};
}

export const getVaultPDA = async (program: Program<Multiple>, seed: string): Promise<PublicKey> => {
	const [vaultPda, vaultBump] = PublicKey.findProgramAddressSync(
		[Buffer.from(seed)],
		program.programId
	);
	return vaultPda;
}

