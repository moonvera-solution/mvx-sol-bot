import  bs58 from 'bs58';
import { ReferralProvider } from "@jup-ag/referral-sdk";
import { PublicKey } from "@metaplex-foundation/js";
import {Connection,Keypair,sendAndConfirmTransaction,} from "@solana/web3.js";
import dotenv from 'dotenv'; dotenv.config();
/**
 * 
 * JUP REFERRAL ACCOUNT FOR BOT ALREADY EXISTS
 * HH2UqSLMJZ9VP9jnneixYKe3oW8873S9MLUuMF3xvjLH
 * 
 */


// {
//   txId: '2rvrVEPWtjJLcQrE1fBZWsvhJy3mvCP4EM2f6YDqv5aq1EqHQj4nqrVYU1qHFnDJTGi2gE44WZCvGsK1XcRrEojr',
//   referralAccountPubKey: 'HH2UqSLMJZ9VP9jnneixYKe3oW8873S9MLUuMF3xvjLH'
// }

const JUPITER_PROJECT = new PublicKey("45ruCyfdRkWpRNGEqWzjCiXRHkZs8WXCLQ67Pnpye7Hp");

const connection = new Connection(`${process.env.TRITON_RPC_URL!}${process.env.TRITON_RPC_TOKEN!}`);
const keypair = Keypair.fromSecretKey(bs58.decode(process.env.JUP_REF_KEY!));
console.log(keypair.publicKey.toBase58());
const provider = new ReferralProvider(connection);
const referralAccountKeypair = Keypair.generate();


(async () => {
  const tx = await provider.initializeReferralAccount({
    payerPubKey: keypair.publicKey,
    partnerPubKey: keypair.publicKey,
    projectPubKey: JUPITER_PROJECT,
    referralAccountPubKey: referralAccountKeypair.publicKey,
  });

  const referralAccount = await connection.getAccountInfo(
    referralAccountKeypair.publicKey,
  );

  if (!referralAccount) {
    const txId = await sendAndConfirmTransaction(connection, tx, [
      keypair,
      referralAccountKeypair,
    ]);
    console.log({
      txId,
      referralAccountPubKey: referralAccountKeypair.publicKey.toBase58(),
    });
  } else {
    console.log(
      `referralAccount ${referralAccountKeypair.publicKey.toBase58()} already exists`,
    );
  }
})();



export const getKeypairFromFile = async () => {
  const bs58 = require('bs58');
  const privkey = new Uint8Array([1,2,3,4,5]);
  console.log(bs58.encode(privkey));
};