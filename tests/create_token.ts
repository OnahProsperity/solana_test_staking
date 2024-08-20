import {
	createMint,
	getMint,
	getOrCreateAssociatedTokenAccount,
	mintTo,
	getAccount,
} from "@solana/spl-token";
import { Program } from "@coral-xyz/anchor";

import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";

anchor.setProvider(anchor.AnchorProvider.env());

const payer = Keypair.generate();
const mintAuthority = Keypair.generate();
const freezeAuthority = Keypair.generate();
const provider = anchor.getProvider();

interface token_data {
	mint: PublicKey;
	mintAuthority: Keypair;
	freezeAuthority: Keypair;
	payer: Keypair;
	tokenAccount: PublicKey;
}
export const createToken = async (): Promise<token_data> => {
	const connection = provider.connection;
	const airdropSignature = await connection.requestAirdrop(
		payer.publicKey,
		LAMPORTS_PER_SOL
	);

	await connection.confirmTransaction(airdropSignature);

	const mint = await createMint(
		connection,
		payer,
		mintAuthority.publicKey,
		freezeAuthority.publicKey,
		6 // We are using 9 to match the CLI decimal default exactly
	);

	let mintInfo = await getMint(connection, mint);

	// console.log(mintInfo.supply);

	const tokenAccount = await getOrCreateAssociatedTokenAccount(
		connection,
		payer,
		mint,
		payer.publicKey
	);

	// console.log(tokenAccount.address.toBase58());

	await mintTo(
		connection,
		payer,
		mint,
		tokenAccount.address,
		mintAuthority,
		100000000000 // because decimals for the mint are set to 9
	);
	mintInfo = await getMint(connection, mint);

	return {
		mint: mint,
		mintAuthority: mintAuthority,
		freezeAuthority: freezeAuthority,
		payer: payer,
		tokenAccount: tokenAccount.address,
	};
};
