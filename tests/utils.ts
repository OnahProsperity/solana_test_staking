import * as anchor from "@coral-xyz/anchor";
import {SystemProgram, PublicKey, Keypair } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import { Multiple } from "../target/types/multiple";

interface Vault {
	owner: PublicKey;
	feeReceiver: PublicKey;
	usdcToken: PublicKey;
	minimumDeposit: anchor.BN;
	fee: anchor.BN;
	mbps: anchor.BN;
	depositInitialized: boolean;
}
const initSeed = "InitializedSeed";

const provider = anchor.getProvider();
const connection = provider.connection;

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

export const setUsdcToken = async (
	program: Program<Multiple>,
	key: Keypair,
	usdcToken: PublicKey
) => {
	const vaultPda = await getVaultPDA(program, initSeed);

	const txHash = await program.methods
		.setUsdcToken(usdcToken)
		.accounts({
			user: key.publicKey,
			vault: vaultPda,
			system_program: SystemProgram.programId,
		})
		.signers([key])
		.rpc();

	await connection.confirmTransaction(txHash, "confirmed");
};

export const setFeeReceiverAndFeePercentage = async (
	program: Program<Multiple>,
	key: Keypair,
	feeReceiver: PublicKey,
	fee: anchor.BN
) => {
	const vaultPda = await getVaultPDA(program, initSeed);

	const txHash = await program.methods
		.setFeeReceiverAndFeePercent(feeReceiver, fee)
		.accounts({
			user: key.publicKey,
			vault: vaultPda,
			system_program: SystemProgram.programId,
		})
		.signers([key])
		.rpc();

	await connection.confirmTransaction(txHash, "confirmed");
}

export const setDepositStatus = async (
	program: Program<Multiple>,
	key: Keypair,
	status: boolean
) => {
	const vaultPda = await getVaultPDA(program, initSeed);

	const txHash = await program.methods
		.setDepositStatus(status)
		.accounts({
			user: key.publicKey,
			vault: vaultPda,
			system_program: SystemProgram.programId,
		})
		.signers([key])
		.rpc();

	await connection.confirmTransaction(txHash, "confirmed");
}

