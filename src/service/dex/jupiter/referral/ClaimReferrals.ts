import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { ReferralProvider } from "@jup-ag/referral-sdk";
import {Connection,Keypair,PublicKey} from "@solana/web3.js";
import dotenv from 'dotenv'; dotenv.config();

const connection = new Connection(`${process.env.TRITON_RPC_URL!}${process.env.TRITON_RPC_TOKEN!}`);
const keypair = Keypair.fromSecretKey(bs58.decode(process.env.JUP_REF_ACCOUNT_AUTHORITY_KEY!));
const provider = new ReferralProvider(connection);
const MVX_JUP_REFERRAL = "HH2UqSLMJZ9VP9jnneixYKe3oW8873S9MLUuMF3xvjLH";

(async () => {
  // This method will returns a list of transactions for all claims batched by 5 claims for each transaction.
  const txs = await provider.claimAll({
    payerPubKey: keypair.publicKey, referralAccountPubKey: new PublicKey(MVX_JUP_REFERRAL)
  });

  console.log("txs:: ",txs)

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash();

  // Send each claim transaction one by one.
  for (const tx of txs) {
    tx.message.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    tx.sign([keypair]);

    const txid = await connection.sendRawTransaction(tx.serialize(), {preflightCommitment: "processed"});
    const { value } = await connection.confirmTransaction({
      signature: txid,
      blockhash:(await connection.getLatestBlockhash()).blockhash,
      lastValidBlockHeight,
    });

    if (value.err) {
      console.log({ value, txid });
    } else {
      console.log({ txid });
    }
  }
})();