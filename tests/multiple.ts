import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Multiple } from "../target/types/multiple";
import {
	PublicKey,
	Keypair,
	SystemProgram,
	LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
	getVaultData,
	getVaultPDA,
	setUsdcToken,
	setFeeReceiverAndFeePercentage,
	setDepositStatus,
	deposit,
} from "./utils";
import {
	getOrCreateAssociatedTokenAccount,
	createMint,
	mintTo,
	getMint,
	getAccount,
} from "@solana/spl-token";
import { assert, expect } from "chai";

anchor.setProvider(anchor.AnchorProvider.env());

const Multiple_Program = anchor.workspace.Multiple as Program<Multiple>;
const provider = anchor.getProvider();
const connection = provider.connection;

let owner: Keypair;
let fee_receiver: Keypair;
let attacker: Keypair;
let USDC: PublicKey;
let tokenAccount: any; // You can replace `any` with the correct type if known
const airdropAmount = new anchor.BN(100 * LAMPORTS_PER_SOL);

before(async () => {
	// This block runs once before all tests
	owner = anchor.web3.Keypair.generate();
	fee_receiver = anchor.web3.Keypair.generate();
	attacker = anchor.web3.Keypair.generate();

	// Airdrop SOL to owner
	const rq = await connection.requestAirdrop(
		owner.publicKey,
		airdropAmount.toNumber()
	);
	await connection.confirmTransaction(rq, "confirmed");

	// Create the USDC mint and associated token account for the owner
	USDC = await createMint(
		connection,
		owner,
		owner.publicKey,
		owner.publicKey,
		6 // 6 decimal places for USDC
	);

	tokenAccount = await getOrCreateAssociatedTokenAccount(
		connection,
		owner,
		USDC,
		owner.publicKey
	);

	// Mint some USDC to the owner's token account
	await mintTo(
		connection,
		owner,
		USDC,
		tokenAccount.address,
		owner,
		100000000000 // Mint amount
	);
});

beforeEach(async () => {
	// This block runs before each `it` test
	// Additional setup that needs to happen before each test goes here
	// For example, re-airdropping SOL to the owner if needed
	const rq = await connection.requestAirdrop(
		owner.publicKey,
		airdropAmount.toNumber()
	);
	await connection.confirmTransaction(rq, "confirmed");
});

describe("Ownership configuration and vault init", async () => {
	it("Vault Is initialized!", async () => {
		const txHash_init = await Multiple_Program.methods
			.initialize(
				fee_receiver.publicKey,
				USDC,
				new anchor.BN(1000), // minimum deposit
				new anchor.BN(10), // fee percentage
				true // vault initialization flag
			)
			.accounts({
				owner: owner.publicKey,
			})
			.signers([owner])
			.rpc();

		await connection.confirmTransaction(txHash_init, "confirmed");
	});

	it("Revert when vault is initialized and try to init again", async () => {
		const vaultPda = await getVaultPDA(Multiple_Program, "InitializedSeed");

		try {
			await Multiple_Program.methods
				.initialize(
					fee_receiver.publicKey,
					USDC,
					new anchor.BN(1000), // minimum deposit
					new anchor.BN(10), // fee percentage
					true // vault initialization flag
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
			const expectedErrorMessage = "Initialize";
			assert.include(
				error.message,
				expectedErrorMessage,
				"Error message does not match"
			);
		}
	});

	it("Revert when attacker tries to set the USDC token", async () => {
		const attacker_usdc = new PublicKey(
			"B9fogerC7NF2kbP32HnbkRKLPjFh79hTSxh8VX3LDSYH"
		);

		try {
			await setUsdcToken(Multiple_Program, attacker, attacker_usdc);

			// If the transaction succeeds, you can add assertions here
			console.log("Transaction succeeded");
		} catch (error) {
			const expectedErrorMessage = "Caller is not owner";
			assert.include(
				error.message,
				expectedErrorMessage,
				"Error message does not match"
			);
		}

		const vaultPda = await getVaultPDA(Multiple_Program, "InitializedSeed");
		const vaultInfo = await getVaultData(vaultPda, Multiple_Program);
		expect(vaultInfo.usdcToken.toBase58()).to.eq(USDC.toBase58());
	});

	it("Owner should be able to set the Fee receiver and fee percent in the vault", async () => {
		const new_fee_receiver = anchor.web3.Keypair.generate();
		const new_fee_percent = new anchor.BN(20);

		await setFeeReceiverAndFeePercentage(
			Multiple_Program,
			owner,
			new_fee_receiver.publicKey,
			new_fee_percent
		);

		const vaultPda = await getVaultPDA(Multiple_Program, "InitializedSeed");
		const vaultInfo = await getVaultData(vaultPda, Multiple_Program);
		expect(vaultInfo.feeReceiver.toBase58()).to.eq(
			new_fee_receiver.publicKey.toBase58()
		);
		expect(vaultInfo.fee.toNumber()).to.eq(new_fee_percent.toNumber());
	});

	it("Revert when attacker tries to set the Fee receiver and fee percent", async () => {
		const attacker_fee_percent = new anchor.BN(30);

		try {
			await setFeeReceiverAndFeePercentage(
				Multiple_Program,
				attacker,
				fee_receiver.publicKey,
				attacker_fee_percent
			);

			console.log("Transaction succeeded");
		} catch (error) {
			const expectedErrorMessage = "Caller is not owner";
			assert.include(
				error.message,
				expectedErrorMessage,
				"Error message does not match"
			);
		}

		const vaultPda = await getVaultPDA(Multiple_Program, "InitializedSeed");
		// const vaultInfo = await getVaultData(vaultPda, Multiple_Program);
		// expect(vaultInfo.feeReceiver.toBase58()).to.eq(
		// 	fee_receiver.publicKey.toBase58()
		// );
		// expect(vaultInfo.fee.toNumber()).to.eq(new anchor.BN(20).toNumber());
	});

	it("Owner should be able to set the deposit status", async () => {
		await setDepositStatus(Multiple_Program, owner, false);

		const vaultPda = await getVaultPDA(Multiple_Program, "InitializedSeed");
		const vaultInfo = await getVaultData(vaultPda, Multiple_Program);
		expect(vaultInfo.depositInitialized).to.eq(false);
	});

	it("Revert when attacker tries to set the deposit status", async () => {
		try {
			await setDepositStatus(Multiple_Program, attacker, true);

			console.log("Transaction succeeded");
		} catch (error) {
			const expectedErrorMessage = "Caller is not owner";
			assert.include(
				error.message,
				expectedErrorMessage,
				"Error message does not match"
			);
		}

		const vaultPda = await getVaultPDA(Multiple_Program, "InitializedSeed");
		const vaultInfo = await getVaultData(vaultPda, Multiple_Program);
		expect(vaultInfo.depositInitialized).to.eq(false);
	});

	it("Should be able to deposit", async () => {
		// const vaultPda = await getVaultPDA(Multiple_Program, "InitializedSeed");
		const programAuthorityPDA = await getVaultPDA(
			Multiple_Program,
			"AuthoritySeed"
		);
		// const vaultInfo = await getVaultData(vaultPda, Multiple_Program);

		const associatedTokenAccount = anchor.utils.token.associatedAddress({
			mint: USDC,
			owner: owner.publicKey,
		});

		const tokenAccountInfo = await connection.getAccountInfo(
			associatedTokenAccount
		);

		if (!tokenAccountInfo) {
			console.log("Creating associated token account");
			await getOrCreateAssociatedTokenAccount(
				connection,
				owner,
				USDC,
				owner.publicKey
			);
		}

		const usdcTokenAccountProgram = await getOrCreateAssociatedTokenAccount(
			connection,
			owner,
			USDC,
			programAuthorityPDA,
			true
		);

    const ownerAccountBeforeStake = await getAccount(connection, tokenAccount.address);
    const programAccountBeforeStake = await getAccount(connection, usdcTokenAccountProgram.address);
    expect(ownerAccountBeforeStake.amount.toString()).to.eq("100000000000");
    expect(programAccountBeforeStake.amount.toString()).to.eq("0");



		await deposit(
			Multiple_Program,
			owner,
			new anchor.BN(10000000),
			usdcTokenAccountProgram.address,
			tokenAccount.address,
			programAuthorityPDA,
			USDC,
		);

    const ownerAccountAfterStake = await getAccount(connection, tokenAccount.address);
    const programAccountAfterStake = await getAccount(connection, usdcTokenAccountProgram.address);
    expect(ownerAccountAfterStake.amount.toString()).to.eq("99990000000");
    expect(programAccountAfterStake.amount.toString()).to.eq("10000000");
	});
});
