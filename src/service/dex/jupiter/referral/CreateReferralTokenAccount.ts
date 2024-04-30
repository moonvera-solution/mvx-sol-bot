import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { ReferralProvider } from "@jup-ag/referral-sdk";
import {Connection,Keypair,PublicKey,sendAndConfirmTransaction} from "@solana/web3.js";
import dotenv from 'dotenv'; dotenv.config();

const connection = new Connection(`${process.env.TRITON_RPC_URL!}${process.env.TRITON_RPC_TOKEN!}`);
const keypair = Keypair.fromSecretKey(bs58.decode(process.env.JUP_REF_ACCOUNT_AUTHORITY_KEY || ""));
const provider = new ReferralProvider(connection);
 const MVX_JUP_REFERRAL = "HH2UqSLMJZ9VP9jnneixYKe3oW8873S9MLUuMF3xvjLH";
const WEN_TOKEN = "WENWENvqqNya429ubCdR81ZmD69brwQaaBYY6p3LCpk";
/**
 * 
 * We have to run this for each token mint we trade - pain in the 
 * WEN : EsAaFBS5xCqdg3TkmwZTThS5NwKpqFs3jj1XBJyWSqwV
 * 
 * 
 */
(async () => {
  const mint = new PublicKey(WEN_TOKEN);
  const { tx, referralTokenAccountPubKey } =
    await provider.initializeReferralTokenAccount({
      payerPubKey: keypair.publicKey,referralAccountPubKey: new PublicKey(MVX_JUP_REFERRAL),mint,
    });
  const referralTokenAccount = await connection.getAccountInfo(referralTokenAccountPubKey,);
  if (!referralTokenAccount) {
    const txId = await sendAndConfirmTransaction(connection, tx, [keypair]);
    console.log({txId,referralTokenAccountPubKey: referralTokenAccountPubKey.toBase58()});
  } else {
    console.log(`referralTokenAccount ${referralTokenAccountPubKey.toBase58()} for mint ${mint.toBase58()} already exists`);
  }
})();