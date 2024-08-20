import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { UsdcStake } from "../target/types/usdc_stake";
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
	setStakeStatus,
	stake,
	unstake,
	getUserData,
} from "./utils";
import {
	getOrCreateAssociatedTokenAccount,
	createMint,
	mintTo,
	getAccount,
} from "@solana/spl-token";
import { assert, expect } from "chai";

anchor.setProvider(anchor.AnchorProvider.env());

const UsdcStake_Program = anchor.workspace.UsdcStake as Program<UsdcStake>;
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
		const txHash_init = await UsdcStake_Program.methods
			.initialize(
				fee_receiver.publicKey,
				USDC,
				new anchor.BN(1000), // minimum stake
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
		const vaultPda = await getVaultPDA(UsdcStake_Program, "InitializedSeed");

		try {
			await UsdcStake_Program.methods
				.initialize(
					fee_receiver.publicKey,
					USDC,
					new anchor.BN(1000), // minimum stake
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
			await setUsdcToken(UsdcStake_Program, attacker, attacker_usdc);

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

		const vaultPda = await getVaultPDA(UsdcStake_Program, "InitializedSeed");
		const vaultInfo = await getVaultData(vaultPda, UsdcStake_Program);
		expect(vaultInfo.usdcToken.toBase58()).to.eq(USDC.toBase58());
	});

	it("Owner should be able to set the Fee receiver and fee percent in the vault", async () => {
		const new_fee_receiver = anchor.web3.Keypair.generate();
		const new_fee_percent = new anchor.BN(20);

		await setFeeReceiverAndFeePercentage(
			UsdcStake_Program,
			owner,
			new_fee_receiver.publicKey,
			new_fee_percent
		);

		const vaultPda = await getVaultPDA(UsdcStake_Program, "InitializedSeed");
		const vaultInfo = await getVaultData(vaultPda, UsdcStake_Program);
		expect(vaultInfo.feeReceiver.toBase58()).to.eq(
			new_fee_receiver.publicKey.toBase58()
		);
		expect(vaultInfo.fee.toNumber()).to.eq(new_fee_percent.toNumber());
	});

	it("Revert when attacker tries to set the Fee receiver and fee percent", async () => {
		const attacker_fee_percent = new anchor.BN(30);

		try {
			await setFeeReceiverAndFeePercentage(
				UsdcStake_Program,
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

		const vaultPda = await getVaultPDA(UsdcStake_Program, "InitializedSeed");
		// const vaultInfo = await getVaultData(vaultPda, UsdcStake_Program);
		// expect(vaultInfo.feeReceiver.toBase58()).to.eq(
		// 	fee_receiver.publicKey.toBase58()
		// );
		// expect(vaultInfo.fee.toNumber()).to.eq(new anchor.BN(20).toNumber());
	});

	it("Owner should be able to set the stake status", async () => {
		await setStakeStatus(UsdcStake_Program, owner, false);

		const vaultPda = await getVaultPDA(UsdcStake_Program, "InitializedSeed");
		const vaultInfo = await getVaultData(vaultPda, UsdcStake_Program);
		expect(vaultInfo.stakeInitialized).to.eq(false);
	});

	it("Revert when attacker tries to set the stake status", async () => {
		try {
			await setStakeStatus(UsdcStake_Program, attacker, true);

			console.log("Transaction succeeded");
		} catch (error) {
			const expectedErrorMessage = "Caller is not owner";
			assert.include(
				error.message,
				expectedErrorMessage,
				"Error message does not match"
			);
		}

		const vaultPda = await getVaultPDA(UsdcStake_Program, "InitializedSeed");
		const vaultInfo = await getVaultData(vaultPda, UsdcStake_Program);
		expect(vaultInfo.stakeInitialized).to.eq(false);
	});

	it("Should be able to stake", async () => {
		const vaultPda = await getVaultPDA(UsdcStake_Program, "InitializedSeed");
		const programAuthorityPDA = await getVaultPDA(
			UsdcStake_Program,
			"AuthoritySeed"
		);
		let vaultInfo = await getVaultData(vaultPda, UsdcStake_Program);
		// console.log(vaultInfo);

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

		const ownerAccountBeforeStake = await getAccount(
			connection,
			tokenAccount.address
		);
		const programAccountBeforeStake = await getAccount(
			connection,
			usdcTokenAccountProgram.address
		);
		expect(ownerAccountBeforeStake.amount.toString()).to.eq("100000000000");
		expect(programAccountBeforeStake.amount.toString()).to.eq("0");

		await stake(
			UsdcStake_Program,
			owner,
			new anchor.BN(10000000),
			usdcTokenAccountProgram.address,
			tokenAccount.address,
			programAuthorityPDA,
			USDC
		);

		const ownerAccountAfterStake = await getAccount(
			connection,
			tokenAccount.address
		);
		const programAccountAfterStake = await getAccount(
			connection,
			usdcTokenAccountProgram.address
		);
		expect(ownerAccountAfterStake.amount.toString()).to.eq("99990000000");
		expect(programAccountAfterStake.amount.toString()).to.eq("10000000"); // 10000000

		vaultInfo = await getVaultData(vaultPda, UsdcStake_Program);
		expect(vaultInfo.totalStaked.toString()).to.eq("10000000");

		let { stakedAmount } = await getUserData(owner, UsdcStake_Program);
		expect(stakedAmount.toString()).to.eq("10000000");

    await stake(
			UsdcStake_Program,
			owner,
			new anchor.BN(10000000),
			usdcTokenAccountProgram.address,
			tokenAccount.address,
			programAuthorityPDA,
			USDC
		);

    ({ stakedAmount } = await getUserData(owner, UsdcStake_Program));
		expect(stakedAmount.toString()).to.eq("20000000");

    vaultInfo = await getVaultData(vaultPda, UsdcStake_Program);
		expect(vaultInfo.totalStaked.toString()).to.eq("20000000");

    await unstake(
      UsdcStake_Program,
      owner,
      new anchor.BN(10000000),
      usdcTokenAccountProgram.address,
      tokenAccount.address,
      programAuthorityPDA,
      USDC
    );

    ({ stakedAmount } = await getUserData(owner, UsdcStake_Program));
		expect(stakedAmount.toString()).to.eq("10000000");

		vaultInfo = await getVaultData(vaultPda, UsdcStake_Program);
		expect(vaultInfo.totalStaked.toString()).to.eq("10000000");

	});
});
