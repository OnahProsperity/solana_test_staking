import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Multiple } from "../target/types/multiple";
import {
	PublicKey,
	Keypair, SystemProgram,
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
} from "@solana/spl-token";

import {createToken} from "./create_token";
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

// const USDC = new PublicKey("2Hw2Eto4qWokwsLLVmTtbuDayxp67yPFRwJPMwr9EHbE"); //new PublicKey("CdVeeZc5BzMvX8KXbsizTyad8XbhcSedop2PoAXzHmxy");

const minimum_deposit = new anchor.BN(1000);
const fee_percent = new anchor.BN(10);
const vault_init = true;
const airdropAmount = new anchor.BN(100 * LAMPORTS_PER_SOL);
const new_fee_receiver = anchor.web3.Keypair.generate();
const new_fee_percent = new anchor.BN(20);

// Call the set_usdc_token method
const attacker_usdc = new PublicKey(
	"B9fogerC7NF2kbP32HnbkRKLPjFh79hTSxh8VX3LDSYH"
);

describe("Ownership configuration and vault init", async () => {
	// Placeholder for USDC mint
	let USDC: PublicKey;
	let tokenAccount: any;

	before(async () => {
		// Airdrop SOL to the owner
		const rq = await connection.requestAirdrop(
			owner.publicKey,
			airdropAmount.toNumber()
		);
		await connection.confirmTransaction(rq, "confirmed");

		// Create a USDC mint
		USDC = await createMint(
			connection,
			owner,
			owner.publicKey,
			owner.publicKey,
			6 // 6 decimals for USDC
		);

		// Create an associated token account for the owner
		tokenAccount = await getOrCreateAssociatedTokenAccount(
			connection,
			owner,
			USDC,
			owner.publicKey
		);

		// Mint some USDC to the token account
		await mintTo(
			connection,
			owner,
			USDC,
			tokenAccount.address,
			owner,
			100000000000 // because decimals for the mint are set to 6
		);
	});

	it("Vault Is initialized!", async () => {
		const txHash_init = await Multiple_Program.methods
			.initialize(
				fee_receiver.publicKey,
				USDC,
				minimum_deposit,
				fee_percent,
				vault_init
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
					USDC,
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

	// it("Owner should be able to Sets the USDC token in the vault", async () => {
	// 	// Assume vaultPda is already available from a previous test or initialization
	// 	const vaultPda = await getVaultPDA(Multiple_Program, "InitializedSeed");

	// 	// Request airdrop to the owner (if needed)
	// 	const rq = await connection.requestAirdrop(
	// 		owner.publicKey,
	// 		airdropAmount.toNumber()
	// 	);
	// 	await connection.confirmTransaction(rq, "confirmed");

	// 	await setUsdcToken(Multiple_Program, owner, newUsdcToken);

	// 	// Fetch the vault data to verify the usdc_token was set
	// 	const vaultInfo = await getVaultData(vaultPda, Multiple_Program);
	// 	expect(vaultInfo.usdcToken.toBase58()).to.eq(newUsdcToken.toBase58());
	// });

	// should revert when attacker tries to set the USDC token
	it("Revert when attacker tries to set the USDC token", async () => {
		// Assume vaultPda is already available from a previous test or initialization
		// Request airdrop to the owner (if needed)
		const rq = await connection.requestAirdrop(
			owner.publicKey,
			airdropAmount.toNumber()
		);
		await connection.confirmTransaction(rq, "confirmed");

		try {
			// Your transaction code here
			await setUsdcToken(Multiple_Program, attacker, attacker_usdc);

			// If the transaction succeeds, you can add assertions here
			console.log("Transaction succeeded");
		} catch (error) {
			// Check for the specific error message
			const expectedErrorMessage = "Caller is not owner";
			assert.include(
				error.message,
				expectedErrorMessage,
				"Error message does not match"
			);
		}

		const vaultPda = await getVaultPDA(Multiple_Program, "InitializedSeed");
		// Fetch the vault data to verify the usdc_token was set
		const vaultInfo = await getVaultData(vaultPda, Multiple_Program);
		expect(vaultInfo.usdcToken.toBase58()).to.eq(USDC.toBase58());
	});

	it("Owner should be able to Sets the Fee receiver and fee percent in the vault", async () => {
		// Request airdrop to the owner (if needed)
		const rq = await connection.requestAirdrop(
			owner.publicKey,
			airdropAmount.toNumber()
		);
		await connection.confirmTransaction(rq, "confirmed");

		await setFeeReceiverAndFeePercentage(
			Multiple_Program,
			owner,
			new_fee_receiver.publicKey,
			new_fee_percent
		);

		// Assume vaultPda is already available from a previous test or initialization
		const vaultPda = await getVaultPDA(Multiple_Program, "InitializedSeed");
		// Fetch the vault data to verify the usdc_token was set
		const vaultInfo = await getVaultData(vaultPda, Multiple_Program);
		expect(vaultInfo.feeReceiver.toBase58()).to.eq(
			new_fee_receiver.publicKey.toBase58()
		);
		expect(vaultInfo.fee.toNumber()).to.eq(new_fee_percent.toNumber());
	});

	// should revert when attacker tries to set the fee receiver and fee percent
	it("Revert when attacker tries to set the Fee receiver and fee percent in the vault", async () => {
		// Assume vaultPda is already available from a previous test or initialization
		// Request airdrop to the owner (if needed)
		const rq = await connection.requestAirdrop(
			owner.publicKey,
			airdropAmount.toNumber()
		);
		await connection.confirmTransaction(rq, "confirmed");
		const attacker_fee_percent = new anchor.BN(30);
		try {
			await setFeeReceiverAndFeePercentage(
				Multiple_Program,
				attacker,
				new_fee_receiver.publicKey,
				attacker_fee_percent
			);

			// If the transaction succeeds, you can add assertions here
			console.log("Transaction succeeded");
		} catch (error) {
			// Check for the specific error message
			const expectedErrorMessage = "Caller is not owner";
			assert.include(
				error.message,
				expectedErrorMessage,
				"Error message does not match"
			);
		}

		// Assume vaultPda is already available from a previous test or initialization
		const vaultPda = await getVaultPDA(Multiple_Program, "InitializedSeed");
		const vaultInfo = await getVaultData(vaultPda, Multiple_Program);
		expect(vaultInfo.feeReceiver.toBase58()).to.eq(
			new_fee_receiver.publicKey.toBase58()
		);
		expect(vaultInfo.fee.toNumber()).to.eq(new_fee_percent.toNumber());
	});

	it("Owner should be able to Sets the Fee receiver and fee percent in the vault", async () => {
		// Assume vaultPda is already available from a previous test or initialization
		const vaultPda = await getVaultPDA(Multiple_Program, "InitializedSeed");

		// Request airdrop to the owner (if needed)
		const rq = await connection.requestAirdrop(
			owner.publicKey,
			airdropAmount.toNumber()
		);
		await connection.confirmTransaction(rq, "confirmed");

		const initializedDeposit = false;

		await setDepositStatus(Multiple_Program, owner, false);

		// Fetch the vault data to verify the usdc_token was set
		const vaultInfo = await getVaultData(vaultPda, Multiple_Program);
		expect(vaultInfo.depositInitialized).to.eq(initializedDeposit);
	});

	// should revert when attacker tries to set the deposit status
	it("Revert when attacker tries to set the deposit status", async () => {
		// Assume vaultPda is already available from a previous test or initialization
		// Request airdrop to the owner (if needed)
		const rq = await connection.requestAirdrop(
			owner.publicKey,
			airdropAmount.toNumber()
		);
		await connection.confirmTransaction(rq, "confirmed");

		try {
			await setDepositStatus(Multiple_Program, attacker, true);

			// If the transaction succeeds, you can add assertions here
			console.log("Transaction succeeded");
		} catch (error) {
			// Check for the specific error message
			const expectedErrorMessage = "Caller is not owner";
			assert.include(
				error.message,
				expectedErrorMessage,
				"Error message does not match"
			);
		}
		const vaultPda = await getVaultPDA(Multiple_Program, "InitializedSeed");

		// Fetch the vault data to verify the usdc_token was set
		const vaultInfo = await getVaultData(vaultPda, Multiple_Program);
		expect(vaultInfo.depositInitialized).to.eq(false);
	});

	it("Should be able to deposit", async () => {
		// Request airdrop to the owner (if needed)
		const rq = await connection.requestAirdrop(
			owner.publicKey,
			airdropAmount.toNumber()
		);
		await connection.confirmTransaction(rq, "confirmed");

		const associatedTokenAccount = anchor.utils.token.associatedAddress({
			mint: USDC,
			owner: owner.publicKey,
		});

		await connection.requestAirdrop(owner.publicKey, airdropAmount.toNumber());

		const tokenAccountInfo = await connection.getAccountInfo(
			associatedTokenAccount
		);
		console.log(`Token account info: ${tokenAccountInfo}`);
		if (tokenAccountInfo) {
			console.log("Token account exists:", associatedTokenAccount.toBase58());
		} else {
			console.log("Token account does not exist. Creating one...");
			const tokenAccount = await getOrCreateAssociatedTokenAccount(
				connection,
				owner,
				USDC,
				owner.publicKey
			);
			console.log("Created Token Account:", tokenAccount.address.toBase58());
		}

		console.log("kdkdkdkdkdkdkdkdkdkkddkddk");

		const userAtaInfo = await connection.getAccountInfo(tokenAccount.address);
		console.log("User ATA info: ", userAtaInfo);

		// await deposit(
		// 	Multiple_Program,
		// 	owner,
		// 	new anchor.BN(1000),
		// 	USDC,
		// 	tokenAccount.address
		// 	// vaultInfo.usdcToken
		// );
	});
});

// describe("Ownership configurations", () => {
// 	it("Should be able to deposit", async () => {
// 		// Request airdrop to the owner (if needed)
// 		const rq = await connection.requestAirdrop(
// 			owner.publicKey,
// 			airdropAmount.toNumber()
// 		);
// 		await connection.confirmTransaction(rq, "confirmed");
// 		const user_usdc_account_ata = new PublicKey(
// 			"CdRUps8bktU9fhRA3vX7sRmd4tNreWt2jZ8rvQaCzaKM"
// 		);

// 		const payerSecretKey = Uint8Array.from([
// 			72, 108, 134, 2, 179, 227, 164, 236, 213, 255, 70, 152, 219, 46, 204, 112,
// 			226, 11, 45, 239, 130, 39, 224, 76, 127, 40, 166, 141, 247, 253, 205, 110,
// 			218, 32, 115, 204, 224, 69, 106, 167, 6, 245, 237, 253, 249, 21, 81, 98,
// 			69, 70, 206, 63, 12, 37, 173, 36, 52, 126, 58, 95, 138, 204, 224, 177,
// 		]);

// 		const payer = Keypair.fromSecretKey(payerSecretKey);
//     console.log("Before deposit");
// 		let mintInfo = await getMint(connection, attacker_usdc);
// 		console.log("Mint info supply: ", mintInfo.supply);

// 		const associatedTokenAccount = anchor.utils.token.associatedAddress({
// 			mint: USDC,
// 			owner: payer.publicKey,
// 		});

// 		await connection.requestAirdrop(payer.publicKey, airdropAmount.toNumber());

// 		const tokenAccountInfo = await connection.getAccountInfo(
// 			associatedTokenAccount
// 		);
// 		console.log(`Token account info: ${tokenAccountInfo}`);
// 		if (tokenAccountInfo) {
// 			console.log("Token account exists:", associatedTokenAccount.toBase58());
// 		} else {
// 			console.log("Token account does not exist. Creating one...");
// 			const tokenAccount = await getOrCreateAssociatedTokenAccount(
// 				connection,
// 				payer,
// 				USDC,
// 				payer.publicKey
// 			);
// 			console.log("Created Token Account:", tokenAccount.address.toBase58());
// 		}

		// const tokenAccount = await getOrCreateAssociatedTokenAccount(
		// 	connection,
		// 	payer,
		// 	USDC,
		// 	payer.publicKey
		// );
		// console.log("kdkdkdkdkdkdkdkdkdkkddkddk");

		// const userAtaInfo = await connection.getAccountInfo(tokenAccount.address);
		// console.log("User ATA info: ", userAtaInfo);

		// await deposit(
		// 	Multiple_Program,
		// 	owner,
		// 	new anchor.BN(1000),
		// 	USDC,
		// 	tokenAccount.address
		// 	// vaultInfo.usdcToken
		// );
// 	});

// });

/*
Mint address:  2Hw2Eto4qWokwsLLVmTtbuDayxp67yPFRwJPMwr9EHbE
Mint authority:  CP7sFkJ4uFy3xQ8X8haqCaFj59bPxEMyvc4SfeeKGh19
Freeze authority:  6H1nbt1gwvbPxjhgsKe1FVGvxPnwCbtY9Ddr23e99uH
Payer address:  FgUabCGmmsj4n8jWtuScuz2PARgc6PgLZMZ5AvZPh49N
Payer balance:  0.9985384
Payer address:  Uint8Array(64) [
   72, 108, 134,   2, 179, 227, 164, 236, 213, 255,  70,
  152, 219,  46, 204, 112, 226,  11,  45, 239, 130,  39,
  224,  76, 127,  40, 166, 141, 247, 253, 205, 110, 218,
   32, 115, 204, 224,  69, 106, 167,   6, 245, 237, 253,
  249,  21,  81,  98,  69,  70, 206,  63,  12,  37, 173,
   36,  52, 126,  58,  95, 138, 204, 224, 177
]
freezeAuthority address:  Uint8Array(64) [
  225,   7, 108,  92,  25,  37,  98,  24, 243, 185, 190,
   54, 152, 116, 241, 134, 197,  66, 111, 162, 253,  34,
   86,  42,  51, 156, 191, 112, 101, 164, 124, 131,   1,
   90,   2, 184, 174, 172, 215, 207, 169,  21, 131,  71,
   42,  64, 240, 199,  20, 124, 130, 192, 149, 241, 152,
  165, 108, 212,  91, 157, 153, 158,   1, 136
]
mintAuthority address:  Uint8Array(64) [
  227, 179, 118, 212, 102,  54, 227, 109,  75,  34, 244,
  197, 241, 183,  54, 160, 238,  17, 104,  57,  85,   6,
   21, 107, 188,  11, 242,  64,  37,  23,  26, 193, 169,
   27,  25,  16, 198,  42,  73, 129,   2, 132, 102, 145,
   79,  40,  59,  50, 104,  55,  28, 127, 128, 161,  31,
   97, 152, 135,  54, 160, 200, 181,  18, 128
]
Payer public key:  PublicKey [PublicKey(FgUabCGmmsj4n8jWtuScuz2PARgc6PgLZMZ5AvZPh49N)] {
  _bn: <BN: da2073cce0456aa706f5edfdf91551624546ce3f0c25ad24347e3a5f8acce0b1>
}
freezeAuthority public key:  PublicKey [PublicKey(6H1nbt1gwvbPxjhgsKe1FVGvxPnwCbtY9Ddr23e99uH)] {
  _bn: <BN: 15a02b8aeacd7cfa91583472a40f0c7147c82c095f198a56cd45b9d999e0188>
}
mintAuthority public key:  PublicKey [PublicKey(CP7sFkJ4uFy3xQ8X8haqCaFj59bPxEMyvc4SfeeKGh19)] {
  _bn: <BN: a91b1910c62a4981028466914f283b3268371c7f80a11f61988736a0c8b51280>
}


*/
