import { LimitOrderProvider } from "@jup-ag/limit-order-sdk";
import {
  Keypair,
  Connection,
  PublicKey,
  sendAndConfirmTransaction,
  TransactionSignature,
  TransactionMessage,
} from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import bs58 from "bs58";
import { getTokenDataFromBirdEye } from "../../../../api/priceFeeds/birdEye";
import dotenv from "dotenv";
import { Transaction } from "jito-ts/dist/gen/geyser/confirmed_block";
import BigNumber from "bignumber.js";
dotenv.config();

// The Jupiter Limit Order's project account for the Referral Program is
// 45ruCyfdRkWpRNGEqWzjCiXRHkZs8WXCLQ67Pnpye7Hp referral fees are withdrawable here.

const connection = new Connection(
  `${process.env.TRITON_RPC_URL!}${process.env.TRITON_RPC_TOKEN!}`
);
const MVX_JUP_REFERRAL = "HH2UqSLMJZ9VP9jnneixYKe3oW8873S9MLUuMF3xvjLH";
const wallet = Keypair.fromSecretKey(
  bs58.decode(process.env.JUP_REF_ACCOUNT_AUTHORITY_KEY!)
);

function floatStringToBigNumber(floatStr: string) {
  const parts = floatStr.split(".");
  const integerPart = new BigNumber(parts[0]);
  const fractionalPart = new BigNumber(parts[1] || 0);
  const power = new BigNumber(10).exponentiatedBy(
    parts[1] ? parts[1].length : 0
  );

  return integerPart.times(power).plus(fractionalPart);
}

type LIMIT_ORDER_PARAMS = {
  userWallet: Keypair;
  inputToken: string;
  inAmount: string;
  outputToken: string;
  outAmount: string;
  expiredAt: string | null;
};

export async function setLimitJupiterOrder(
  connection: Connection,
  {
    userWallet,
    inputToken,
    inAmount,
    outputToken,
    outAmount,
    expiredAt,
  }: LIMIT_ORDER_PARAMS
): Promise<TransactionSignature> {
  let txSig = "";
  try {
    const limitOrder = new LimitOrderProvider(
      connection,
      new PublicKey(MVX_JUP_REFERRAL)
    );
    const base = Keypair.generate(); // random unique order id
    const { tx, orderPubKey } = await limitOrder.createOrder({
      // 2.5 fee jup
      owner: userWallet.publicKey,
      inAmount: new BN(inAmount), // 1000000 => 1 USDC if inputToken.address is USDC mint
      outAmount: floatStringToBigNumber(outAmount),
      inputMint: new PublicKey(inputToken),
      outputMint: new PublicKey(outputToken),
      base: base.publicKey,
      expiredAt: expiredAt ? new BN(expiredAt) : null, // new BN(new Date().valueOf() / 1000)
    });
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    tx.sign(userWallet, base);
    txSig = await connection.sendRawTransaction(tx.serialize(), {
      preflightCommitment: "processed",
    });
    // txSig = await sendAndConfirmTransaction(connection, tx, [wallet, base]);
    console.log("txSig:: ", txSig);
    return txSig;
  } catch (e: any) {
    console.log(e.message);
    throw new Error(e.message);
  }
  return txSig;
}

// urrent price: 000196005
// target price  '0.001' SOL  /  000186005 = outAmount

// how to use
// setLimitJupiterOrder(connection,{
//     userWallet: wallet,
//     inputToken: 'So11111111111111111111111111111111111111112',
//     inAmount: new BN(100000).toString(), //'0.001',
//     outputToken: 'WENWENvqqNya429ubCdR81ZmD69brwQaaBYY6p3LCpk',
//     outAmount: new BN(1.191 * 1e5).toString(), //'1.191', //  '0.001' SOL  / token unit curret price  = outAmount
//     expiredAt: null,
// });

/**
 * solana transfer --from DDL8apK4Xr3CYa6vxLccNkJAcX2bQdqRS8o51h2sBeTP.json GF7Mi4vZh4pZPCjwVTXHSDCQCAT9s7WMnGHiiqaP2m7s 30000  --allow-unfunded-recipient
 */
