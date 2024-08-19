import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Multiple } from "../target/types/multiple";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getVaultData, getVaultPDA } from "./utils";
import { assert, expect } from "chai";
import { execSync } from "child_process";

// Configure the client to use the local cluster.
anchor.setProvider(anchor.AnchorProvider.env());

const Multiple_Program = anchor.workspace.Multiple as Program<Multiple>;
const provider = anchor.getProvider();
const connection = provider.connection;
const owner = anchor.web3.Keypair.generate();
const fee_receiver = anchor.web3.Keypair.generate();
const attacker = anchor.web3.Keypair.generate();
const usdc_token = anchor.web3.Keypair.generate();
const minimum_deposit = new anchor.BN(1000);
const fee_percent = new anchor.BN(10);
const vault_init = true;
const airdropAmount = new anchor.BN(100 * LAMPORTS_PER_SOL);

describe("Staking", () => {
	it("Vault Is initialized!", async () => {
		// Add your test here.
		const vaultPda = await getVaultPDA(Multiple_Program, "InitializedSeed");

		const { depositInitialized } = await getVaultData(
			vaultPda,
			Multiple_Program
		);
		if (depositInitialized) {
			console.log("Vault is already initiated");
		} else {
			const rq = await connection.requestAirdrop(
				owner.publicKey,
				airdropAmount.toNumber()
			);
			await connection.confirmTransaction(rq, "confirmed");
			const txHash_init = await Multiple_Program.methods
				.initialize(
					fee_receiver.publicKey,
					usdc_token.publicKey,
					minimum_deposit,
					fee_percent,
					vault_init
				)
				.accounts({
					owner: owner.publicKey,
					vault: vaultPda,
					system_program: SystemProgram.programId,
				})
				.signers([owner])
				.rpc();

			await connection.confirmTransaction(txHash_init, "confirmed");
		}

		let vaultInfo = await getVaultData(vaultPda, Multiple_Program);
		expect(vaultInfo.depositInitialized).to.eq(vault_init);
	});

	it("Revert when vault is initialized and try to init again", async () => {
		const vaultPda = await getVaultPDA(Multiple_Program, "InitializedSeed");
		const rq = await connection.requestAirdrop(
			owner.publicKey,
			airdropAmount.toNumber()
		);
		await connection.confirmTransaction(rq, "confirmed");
		// expect the transaction to revert with initialized vault
		try {
			// Your transaction code here
			await Multiple_Program.methods
				.initialize(
					fee_receiver.publicKey,
					usdc_token.publicKey,
					minimum_deposit,
					fee_percent,
					vault_init
				)
				.accounts({
					owner: owner.publicKey,
					vault: vaultPda,
					system_program: SystemProgram.programId,
				})
				.signers([owner])
				.rpc();

			// If the transaction succeeds, you can add assertions here
			console.log("Transaction succeeded");
		} catch (error) {
			// Check for the specific error message
			const expectedErrorMessage = "Initialize";
			assert.include(
				error.message,
				expectedErrorMessage,
				"Error message does not match"
			);
		}
	});
});

describe("Ownership configurations", () => {

	it("Sets the USDC token in the vault", async () => {
		// Assume vaultPda is already available from a previous test or initialization
		const vaultPda = await getVaultPDA(Multiple_Program, "InitializedSeed");

		// Request airdrop to the owner (if needed)
		const rq = await connection.requestAirdrop(
			owner.publicKey,
			airdropAmount.toNumber()
		);
		await connection.confirmTransaction(rq, "confirmed");

		// Call the set_usdc_token method
		const newUsdcToken = anchor.web3.Keypair.generate().publicKey;
		const txHash = await Multiple_Program.methods
			.setUsdcToken(newUsdcToken)
			.accounts({
				user: owner.publicKey,
				vault: vaultPda,
				system_program: SystemProgram.programId,
			})
			.signers([owner])
			.rpc();

		await connection.confirmTransaction(txHash, "confirmed");

		// Fetch the vault data to verify the usdc_token was set
		const vaultInfo = await getVaultData(vaultPda, Multiple_Program);
		expect(vaultInfo.usdcToken.toBase58()).to.eq(newUsdcToken.toBase58());
	});


	it("Sets the Fee receiver and fee percent in the vault", async () => {
		// Assume vaultPda is already available from a previous test or initialization
		const vaultPda = await getVaultPDA(Multiple_Program, "InitializedSeed");

		// Request airdrop to the owner (if needed)
		const rq = await connection.requestAirdrop(
			owner.publicKey,
			airdropAmount.toNumber()
		);
		await connection.confirmTransaction(rq, "confirmed");

    const new_fee_receiver = anchor.web3.Keypair.generate();
    const new_fee_percent = new anchor.BN(20);

		const txHash = await Multiple_Program.methods
			.setFeeReceiverAndFeePercent(new_fee_receiver.publicKey, new_fee_percent)
			.accounts({
				user: owner.publicKey,
				vault: vaultPda,
				system_program: SystemProgram.programId,
			})
			.signers([owner])
			.rpc();

		await connection.confirmTransaction(txHash, "confirmed");

		// Fetch the vault data to verify the usdc_token was set
		const vaultInfo = await getVaultData(vaultPda, Multiple_Program);
		expect(vaultInfo.feeReceiver.toBase58()).to.eq(new_fee_receiver.publicKey.toBase58());
    expect(vaultInfo.fee.toNumber()).to.eq(new_fee_percent.toNumber());
	});

  it("Sets the Fee receiver and fee percent in the vault", async () => {
		// Assume vaultPda is already available from a previous test or initialization
		const vaultPda = await getVaultPDA(Multiple_Program, "InitializedSeed");

		// Request airdrop to the owner (if needed)
		const rq = await connection.requestAirdrop(
			owner.publicKey,
			airdropAmount.toNumber()
		);
		await connection.confirmTransaction(rq, "confirmed");

		const initializedDeposit = false;

		const txHash = await Multiple_Program.methods
			.setDepositStatus(initializedDeposit)
			.accounts({
				user: owner.publicKey,
				vault: vaultPda,
				system_program: SystemProgram.programId,
			})
			.signers([owner])
			.rpc();

		await connection.confirmTransaction(txHash, "confirmed");

		// Fetch the vault data to verify the usdc_token was set
		const vaultInfo = await getVaultData(vaultPda, Multiple_Program);
    expect(vaultInfo.depositInitialized).to.eq(initializedDeposit);
	});
});
